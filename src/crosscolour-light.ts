import {CrossColourAccessory} from "./crosscolours-accessory";
import {ConfigRoom} from "./model/CrosscolourConfig";

export interface CrosscolourLight extends CrossColourAccessory {
    area: ConfigRoom;
    hue: number;
    brightness: number;
    saturation: number;
}
export class CrosscolourLight implements CrosscolourLight{
    get dimmable(): boolean {
        return this.subtype === 'dimmer';
    }
    get rgb(): boolean {
        return this.subtype === 'rgb';
    }
    constructor(name: string, id: number, area?: ConfigRoom) {
        this.hue = 0;
        this.type = 'Lightbulb';
        this.subtype = 'dimmer';
        this.brightness = 0;
        this.saturation = 0;
        this.displayName = name;
        this.id = id;
        if(area != undefined) {
            this.area = area;
        }
    }
}
