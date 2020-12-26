import {PlatformAccessory} from "homebridge";
export interface CrossColourAccessory extends PlatformAccessory {
    id: number;
    type: string;
    subtype: string;
}
