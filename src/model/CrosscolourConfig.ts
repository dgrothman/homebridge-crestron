export interface CrosscolourConfig {
  data: {
    SysConfig: {
      JobInfo: {
        Name: string;
      },
      Room: ConfigRoom[],
      Source: ConfigSource[],
      Profile: ConfigProfile[],
      TProfile: ConfigTProfile[],
      LLoad: ConfigLLoad[],
      SLoad: ConfigSLoad[],
      Floors: ConfigFloor[]
    }
  }
}
export interface ConfigRoom {
  Name: string;
  RoomOrder: number;
  RoomID: number;
  LightsID: number;
  ThermoID: number;
  ShadesID: number;
  DoorsID: number;
  FireID: number;
  Sources: number[];
  RoomOptions: string[];
  ActiveSRC: number;
  Floor: number;
}
export interface ConfigSource {
  Name: string;
  ID: number;
  Icon: number;
  ARoute: number;
  VRoute: number;
  SRCType: number;
  Speakers: number;
  AudioOnly: boolean;
  GlobalSrc: boolean;
}
export interface ConfigProfile {
  Name: string;
  ID: number;
  VisibleRooms: number[];
  VisibleLightAreas: number[];
  VisibleLightLoads: number[];
  VisibleClimate: number[];
  VisibleFire: number[];
  VisibleDoor: number[];
  VisibleShadesAreas: number[];
  VisibleShadesLoads: number[];
  Visible: number;
}
export interface ConfigTProfile {
  TPID: number;
  ProfID: number;
  DefaultProfile: number;
}
export interface ConfigLLoad {
  Name: string;
  AreaID: number;
  LoadID: number;
  RGB: boolean;
  Dimmable: boolean;
}
export interface ConfigSLoad {
  Name: string;
  AreaID: number;
  LoadID: number;
}
export interface ConfigFloor {
  Position: number;
  Name: string;
  VisibleFloors: number[];
}
