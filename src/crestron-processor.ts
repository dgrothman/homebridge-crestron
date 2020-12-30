import {Socket} from "net";
import {Logging, PlatformAccessory} from "homebridge";
import {CrosscolourLight} from "./crosscolour-light";
import {ConfigRoom, CrosscolourConfig} from "./model/CrosscolourConfig";
import {CrosscolourShade} from "./crosscolour-shade";
const struct = require('python-struct');
const axios = require('axios');

export class CrestronProcessor {
    private readonly ipAddress: string;
    private readonly port: number;
    private readonly slot: number;
    private client: Socket = new Socket();
    private config: CrosscolourConfig | undefined;
    private lights: CrosscolourLight[] = [];
    private shades: CrosscolourShade[] = [];
    private readonly log: Logging;

    constructor(ipAddress: string, port: number, log: Logging, slot: number) {
        this.ipAddress = ipAddress;
        this.port = port;
        this.log = log;
        this.slot = slot < 10 ? slot : 0;
        this.slot = parseInt('4171' + slot.toString());
        this.connectToServer();
    }

    connectToServer() {
        this.log.info(`CCCP connection info: ${this.ipAddress}:${this.port}`);
        this.log.info("CrestronCrossColours ConnectingToServer");
        this.client.connect(this.port, this.ipAddress);
        this.client.on('connect', () => {
            console.log('Server Connected');
        });
        this.client.on('data', (data) => {
            // Digital Join
            const bytes = Uint8Array.from(Buffer.from(data));
            if ((bytes[0] &  parseInt('11000000',2)) == parseInt('10000000',2) &&
                ((bytes[1] & parseInt('10000000',2)) === parseInt('00000000', 2))) {
                const digitalHeader = struct.unpack('BB',bytes);
                const digitalJoin = ((digitalHeader[0] & parseInt('00011111',2)) << 7 | digitalHeader[1]) + 1;
                const digitalValue = ~digitalHeader[0] >> 5 & parseInt('1',2);
                this.log.info(`Received digital join ${digitalJoin} with value of ${digitalValue}`);
            }
            // Analog Join
            else if ((bytes[0] &  parseInt('11001000',2)) == parseInt('11000000',2) &&
                ((bytes[1] & parseInt('10000000',2)) === parseInt('00000000', 2))) {
                const analogHeader = struct.unpack('BBBB',bytes);
                const analogJoin = ((analogHeader[0] & parseInt('00000111',2)) << 7 | analogHeader[1]) + 1;
                const analogValue = ((analogHeader[0] & parseInt('00110000',2)) << 10 | analogHeader[2] << 7 | analogHeader[3]);
                this.log.info(`Received analog join ${analogJoin} with value of ${analogValue}`);
            }
            // Serial Join
            else if ((bytes[0] &  parseInt('11111000',2)) == parseInt('11001000',2) &&
                ((bytes[1] & parseInt('10000000',2)) === parseInt('00000000', 2))) {
                const endIndex = bytes.findIndex(value => {return value == parseInt('ff',16)})
                const serialHeader = struct.unpack('BB', [bytes[0],bytes[1]]);
                const serialJoin = ((serialHeader[0] & parseInt('00000111',2)) << 7 | serialHeader[1]) + 1
                const serialValue = bytes.filter((v,i) => {return i > 1 && i < endIndex});
                this.log.info(`Received serial join ${serialJoin} with value of ${serialValue.toString()} `)
            }
        });
        this.client.on('close',async () => {
            this.log.info('connection closed');
            try {
                //await(500);
                //this.client.connect(this.port, this.ipAddress);
            } catch (err) {
                this.log.error(`CCCP Error reconnecting to server, ${err}`);
            }
        });
    }

    sendData(type: string, subtype: string, ...parameters: any) {
        let data = `{type: ${type}, subtype: ${subtype}`;
        parameters.forEach(item => {
            data += `, ${item.key}: ${item.value}`;
        });

        this.client.write(Buffer.from( data,'utf8'));
    }

    /*
    setAnalog(join: number, value: number) {
        const analogData = struct.pack('>BBBB',
            parseInt('11000000',  2) | (value >> 10 & parseInt('00110000',2)) | (join - 1) >> 7,
            (join - 1) & parseInt('01111111', 2),
            value >> 7 & parseInt('01111111', 2),
            value & parseInt('01111111', 2)
        );
        this.log.info(`Sending ${value} on join ${join}`);
        this.sendData(analogData);
    }

    setDigital(join: number, value: number) {
        const digitalData = struct.pack('>BB',
            parseInt('10000000', 2) | (~value << 5 & parseInt('b00100000')) | join >> 7,
            join & parseInt('01111111',2)
        );
        this.log.info(`Sending ${value} on join ${join}`);
        this.sendData(digitalData);
    }

    setSerial(join: number, value: string) {
        let serialData: Buffer = struct.pack('>BB',
            parseInt('11001000', 2) | ((join - 1) >> 7),
            (join - 1) & parseInt('01111111', 2)
        );
        const valueBuffer: Buffer = Buffer.from(value,'utf8');
        const endChar = Buffer.from('ff', 'hex');
        serialData = Buffer.concat([serialData,valueBuffer,endChar], serialData.length + valueBuffer.length + endChar.length);
        this.log.info(`Sending ${value} on join ${join}`);
        this.sendData(serialData);
    }
     */

    loadDim(id, level) {
        this.sendData('lighting','set', {'id': id, 'level': level});
    }
    
    loadRgbChange(id, h, s, l) {
        const hslRgb = require('hsl-rgb');
        const rgb: number[] = hslRgb(h,s/100,l/100);
        this.sendData('lighting','set', {'id': id, 'rgb': rgb});
    }
    getLightLevel(id): number {
        return 0;
    }
    getLightSat(id): number {
        return 50;
    }
    getLightHue(id): number {
        return 50;
    }
    setWindowPosition(id, position) {

    }
    getWindowPosition(id): number {
        return 50;
    }
    async getConfig() {
        this.log.debug(`Getting Config from http://${this.ipAddress}:${this.slot}/xml/api/config`);
        this.config = await axios.get(`http://${this.ipAddress}:${this.slot}/xml/api/config`);
        this.log.info(`Got Config From API with ${this.config?.data.SysConfig.Room.length} Areas`);

        // Lights
        this.lights = [];
        this.config?.data.SysConfig.LLoad.forEach((load) => {
            const loadArea = this.config?.data.SysConfig.Room.find((room) => room.LightsID === load.AreaID);
            const light = new CrosscolourLight(load.Name,load.LoadID,loadArea);
            light.subtype = 'rgb';
            this.lights.push(light);
        });

        // Shades
        this.shades = [];
        this.config?.data.SysConfig.SLoad.forEach((load) => {
            const loadArea = this.config?.data.SysConfig.Room.find((room) => room.ShadesID === load.AreaID);
            const shade = new CrosscolourShade(load.Name,load.LoadID,loadArea);
            this.shades.push(shade);
        });
    }
    async getLights(): Promise<CrosscolourLight[]> {
        if(this.config == undefined) await this.getConfig();
        return this.lights;
    }
    async getShades(): Promise<CrosscolourShade[]> {
        if(this.config == undefined) await this.getConfig();
        return this.shades;
    }
}
