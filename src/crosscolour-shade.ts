import {CrossColourAccessory} from "./crosscolours-accessory";
import {ConfigRoom} from "./model/CrosscolourConfig";

export interface CrosscolourShade extends CrossColourAccessory {
    area: ConfigRoom;
    position: number;
    state: number;
}
export class CrosscolourShade {
    constructor(name: string, id: number, area?: ConfigRoom) {
        this.position = 0;
        this.state = 2;
        this.displayName = name;
        this.type = 'WindowCovering';
        this.subtype = 'shade';
        this.id = id;
        if(area != undefined) {
            this.area = area
        }
    }
}
