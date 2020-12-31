export class CoreTag {
  public static readonly tagLight: string = "LightCore";
  public static readonly tagArea: string = "AreaCore";
  public static readonly tagShade: string = "ShadeCore";
  public static readonly tagTP: string = "TPCore";
}

export enum EventTag {
  tagRaise = 1,
  tagLower,
  tagOn,
  tagOff,
  tagToggle,
  tagLevelSet,
  tagPreset,
  tagQuery,
  tagUpdate,
  tagNameChange,
  tagAreaStatus,
  tagAreaVC,
  tagXml,
  tagOpen,
  tagClose,
  tagStop,
  tagAreaController,
  tagPress,
  tagRelease,
  tagColorSet,
  tagStarTwinklePress,
  tagStarDimmPress,
}

export class HubEventArgs {
  public requestTo: number;
  public requestBy: number;
  public etag: number;
  public etype: number;
  public Level: number;
  public DeviceName: string;
  public Domain: string;

  constructor(requestTo: number, requestBy: number, tag: number, type: number, level: number, name: string, domain: string) {
    this.requestBy = requestBy;
    this.requestTo = requestTo;
    this.etag = tag;
    this.etype = type;
    this.Level = level;
    this.DeviceName = name;
    this.Domain = domain;
  }
}

