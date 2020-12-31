import {Socket} from "net";
import {Logging} from "homebridge";
import {CrosscolourLight} from "./crosscolour-light";
import {CrosscolourConfig} from "./model/CrosscolourConfig";
import {CrosscolourShade} from "./crosscolour-shade";
import {CoreTag, EventTag, HubEventArgs} from "./model/WeakEntitites";

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
            this.log.info(`data received`);
            this.log.info(data.toString());
            const jsonData: any = data.toString();
            switch (jsonData.domain) {
                case CoreTag.tagLight:
                    this.log.info('received light domain');
                    break;
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

    sendData(data : HubEventArgs) {
        this.client.write(Buffer.from( JSON.stringify(data),'utf8'));
    }

    loadDim(id, level) {
        const hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,level,"",CoreTag.tagLight);
        this.sendData(hea);
    }
    
    loadRgbChange(id, h, s, l) {
        const hslRgb = require('hsl-rgb');
        const rgb: number[] = hslRgb(h,s/100,l/100);
        let hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,rgb[0],"R",CoreTag.tagLight);
        this.sendData(hea);
        hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,rgb[1],"G",CoreTag.tagLight);
        this.sendData(hea);
        hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,rgb[2],"B",CoreTag.tagLight);
        this.sendData(hea);
    }
    setWindowPosition(id, position) {
        let hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,position,"R",CoreTag.tagShade);
        this.sendData(hea);
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
