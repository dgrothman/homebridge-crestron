import {Socket} from "net";
import {Logging} from "homebridge";
import {CrosscolourLight} from "./crosscolour-light";
import {CrosscolourConfig} from "./model/CrosscolourConfig";
import {CrosscolourShade} from "./crosscolour-shade";
import {CoreTag, EventTag, HubEventArgs,} from "./model/WeakEntitites";
const axios = require('axios');
const JsonSocket = require('json-socket');

export class CrestronProcessor {
    private readonly ipAddress: string;
    private readonly port: number;
    private readonly slot: number;
    private client = new JsonSocket(new Socket());
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
        this.client.connect({host: this.ipAddress, port: this.port});
        this.client.on('connect', () => {
            console.log('Server Connected');

        });
        this.client.on('message', (data)=> {
            this.log.info(`message received ${data}`);
        });
        this.client.on('data', (data) => {
            this.log.info(`data received ${data}`);
            let hea: HubEventArgs = new HubEventArgs(0,0,0,0,0,"","");
            try {

                hea = JSON.parse(data.toString());
            } catch (e) {
                this.log.warn(`json parse failed for ${data.toString()}`);
            }
            switch (hea.Domain) {
                case CoreTag.tagLight:
                    const load = this.lights.find(l => l.id === hea.requestBy);
                    if(load == undefined) return;
                    if(hea.etag == EventTag.tagUpdate) {
                        load.brightness = hea.Level;
                    }
                    break;
                case CoreTag.tagShade:
                    const shade = this.shades.find(s => s.id === hea.requestBy);
                    if(shade == undefined) return;
                    this.log.info(`Shade ${shade.displayName} update`);
                    if(hea.etag == EventTag.tagUpdate as number) {
                        if(shade.position < hea.Level) {
                            shade.state = 0;
                            this.log.info(`Shade ${shade.displayName} state decreasing`);
                        } else {
                            shade.state = 1;
                            this.log.info(`Shade ${shade.displayName} state increasing`);
                        }
                        shade.position = hea.Level;
                        this.log.info(`Shade ${shade.displayName} position ${hea.Level}`);
                        setTimeout((id) => {
                            const shade = this.shades.find(s => s.id === hea.requestBy);
                            if(shade == undefined) return;
                            shade.state = 2;
                            this.log.info(`Shade ${shade.displayName} state stopped`);
                        }, 15000, shade.id);
                    }
                    break;
            }
        });
        this.client.on('close',async () => {
            this.log.info('connection closed');
            try {
                await this.delay(10000);
                this.client.connect({port: this.port, host: this.ipAddress});
            } catch (err) {
                this.log.error(`CCCP Error reconnecting to server, ${err}`);
            }
        });
    }

    async sendData(data : HubEventArgs) {
        try {
            var stringData = JSON.stringify(data);
            this.log.info(`sending cmd ${stringData}`);
            await this.client.sendMessage(JSON.stringify(data));
        } catch (e) {
            this.log.error(`Unable to send Data, socket not connected`);
        }
    }

    loadDim(id, level) {
        const hea = new HubEventArgs(id,0,EventTag.tagLevelSet,EventTag.tagPress,level,"",CoreTag.tagLight);
        this.sendData(hea);
    }

    loadSaturationChange(id, s) {

    }
    queryAccessory(id, domain) {
        const hea = new HubEventArgs(id, 0, EventTag.tagQuery, EventTag.tagQuery, 0, "", domain);
        this.log.info(`query for ${domain} with id ${id}`)
        this.sendData(hea);
    }
    getLoadLevel(id): number {
        const load = this.lights.find(l => l.id === id);
        if(load === undefined) return(0);
        return load.brightness;
    }

    getWindowPosition(id): number {
        const shade = this.shades.find(s => s.id === id);
        if(shade === undefined) return(0);
        return shade.position;
    }

    getWindowState(id): number {
        const shade = this.shades.find(s => s.id === id);
        if(shade === undefined) return(0);
        return shade.state;
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
        this.config?.data.SysConfig.LLoad.forEach(async (load) => {
            const loadArea = this.config?.data.SysConfig.Room.find((room) => room.LightsID === load.AreaID);
            const light = new CrosscolourLight(load.Name,load.LoadID,loadArea);
            light.subtype = 'rgb';
            this.lights.push(light);
            await this.delay(5000);
            this.queryAccessory(load.LoadID, CoreTag.tagLight);
        });

        // Shades
        this.shades = [];
        this.config?.data.SysConfig.SLoad.forEach( async (load) => {
            const loadArea = this.config?.data.SysConfig.Room.find((room) => room.ShadesID === load.AreaID);
            const shade = new CrosscolourShade(load.Name,load.LoadID,loadArea);
            this.shades.push(shade);
            await this.delay(5000);
            this.queryAccessory(load.LoadID, CoreTag.tagShade);
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

    delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}
