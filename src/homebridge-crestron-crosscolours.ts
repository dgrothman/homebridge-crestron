import http, {IncomingMessage, Server, ServerResponse} from "http";
import {
  AccessoryName, AccessoryPluginConstructor,
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP, HAPLegacyTypes, Logger,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig, PlatformIdentifier, PlatformName, PlatformPluginConstructor, PluginIdentifier, User,
    Service
} from "homebridge";
import {Socket} from "net";
import {LogLevel} from "homebridge/lib/logger";

const PLUGIN_NAME = "homebridge-crestron-crosscolours";
const PLATFORM_NAME = "CrestronCrossColours";
const struct = require('python-struct');

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;
let Accessory: typeof PlatformAccessory;

export = (api: API) => {
  hap = api.hap;
  Accessory = api.platformAccessory;

  api.registerPlatform(PLATFORM_NAME, CrestronCrossColoursPlatform);
};
class CrestronCrossColoursConfig implements PlatformConfig {
  platform: PlatformName | PlatformIdentifier;
  ipAddress: string;
  port: number;
  accessories: PlatformAccessory[];
}

class CrestronCrossColoursPlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly api: API;

  private readonly config: CrestronCrossColoursConfig;
  private client: Socket = new Socket();
  private readonly ipAddress: string = '192.168.0.249';
  private readonly port: number = 41900;
  private accessories: PlatformAccessory[] = [];

  constructor(log: Logging, config: CrestronCrossColoursConfig, api: API) {
    this.log = log;
    this.api = api;
    this.accessories = [];
    this.config = config;
    // probably parse config or something here

    log.info("CCCP finished initializing!");

    log.info(`CCCP connection info: ${config.ipAddress}:${config.port}`);
    this.ipAddress = config.ipAddress;
    this.port = config.port;

    /*
     * When this event is fired, homebridge restored all cached accessories from disk and did call their respective
     * `configureAccessory` method for all of them. Dynamic Platform plugins should only register new accessories
     * after this event was fired, in order to ensure they weren't added to homebridge already.
     * This event can also be used to start discovery of new accessories.
     */
    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.info("CrestronCrossColours platform 'didFinishLaunching'");
    });
    this.connectToServer();
    this.readConfig();
  };

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log("Configuring accessory %s", accessory.displayName);

    this.accessories.push(accessory);
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log("%s identified!", accessory.displayName);
    });

    accessory.getService(hap.Service.Lightbulb)!.getCharacteristic(hap.Characteristic.On)
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          this.log.info("%s Light was set to: " + value);
          callback();
        });

    this.accessories.push(accessory);
  }

  readConfig() {
    // Remove deleted ones
    let requireRemoval = [];
    this.accessories.forEach((accessory) => {
      if(!this.config.accessories.find(existing => existing.displayName === accessory.displayName)) {
        requireRemoval.push(accessory);
      }
    });
    this.accessories = this.accessories.filter(item => {
      return requireRemoval.find(accessory => accessory === item)
    });
    this.api.unregisterPlatformAccessories(PLUGIN_NAME,PLATFORM_NAME,requireRemoval);

    // Add new ones
    this.config.accessories.forEach((accessory) => {
      if(!this.accessories.find(existing => existing.displayName === accessory.displayName)) {
        this.addAccessory(accessory.displayName,accessory.services)
      }
    });
  }
  connectToServer() {
    this.log.info("CrestronCrossColours ConnectingToServer");
    this.client.connect(this.port, this.ipAddress);
    this.client.on('connect', () => {
      console.log('Server Connected');
      this.setSerial(1,'TESTING');
    });
    this.client.on('data', function(data) {
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
    }.bind(this));
    this.client.on('close',function() {
      this.log.info('connection closed');
      try {
        this.client.connect(this.port, this.ipAddress);
      } catch (err) {
        this.log.error(`CCCP Error reconnecting to server, ${err}`);
      }
    }.bind(this));
  }

  sendData(data: Buffer) {
    this.client.write(data);
  }

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


  // --------------------------- CUSTOM METHODS ---------------------------

  addAccessory(name: string, service: Service[]) {
    this.log.info(`Adding new accessory with name ${name}`);

    // uuid must be generated from a unique but not changing data source, name should not be used in the most cases. But works in this specific example.
    const uuid = hap.uuid.generate(name);
    const accessory = new Accessory(name, uuid);

    service.forEach(service => {
      accessory.addService(service, "");
    });

    this.configureAccessory(accessory); // abusing the configureAccessory here

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }

  removeAccessories() {
    // we don't have any special identifiers, we just remove all our accessories

    this.log.info("Removing all accessories");

    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, this.accessories);
    this.accessories.splice(0, this.accessories.length); // clear out the array
  }


  // ----------------------------------------------------------------------

}


//Testing
// @ts-ignore
class TestLogger implements Logging{
  prefix: string = '';

  debug(message: string, ...parameters: any[]): void {
    console.debug(message);
  }

  error(message: string, ...parameters: any[]): void {
    console.error(message);
  }

  info(message: string, ...parameters: any[]): void {
    console.info(message);
  }

  log(level: LogLevel, message: string, ...parameters: any[]): void {
    console.log(message);
  }

  warn(message: string, ...parameters: any[]): void {
    console.warn(message);
  }
}
class TestApi implements API{
  // @ts-ignore
  readonly hap: HAP;
  // @ts-ignore
  readonly hapLegacyTypes: HAPLegacyTypes;
  // @ts-ignore
  readonly platformAccessory: typeof PlatformAccessory;
  // @ts-ignore
  readonly serverVersion: string;
  // @ts-ignore
  readonly user: typeof User;
  // @ts-ignore
  readonly version: number;

  on(event: "didFinishLaunching", listener: () => void): this;
  on(event: "shutdown", listener: () => void): this;
  on(event: "didFinishLaunching" | "shutdown", listener: () => void): this {
    // @ts-ignore
    return undefined;
  }

  publishCameraAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
  }

  publishExternalAccessories(pluginIdentifier: PluginIdentifier, accessories: PlatformAccessory[]): void {
  }

  registerAccessory(accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerAccessory(pluginIdentifier: PluginIdentifier, accessoryName: AccessoryName, constructor: AccessoryPluginConstructor): void;
  registerAccessory(accessoryName: AccessoryName | PluginIdentifier, constructor: AccessoryPluginConstructor | AccessoryName): void {
  }

  registerPlatform(platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatform(pluginIdentifier: PluginIdentifier, platformName: PlatformName, constructor: PlatformPluginConstructor): void;
  registerPlatform(platformName: PlatformName | PluginIdentifier, constructor: PlatformPluginConstructor | PlatformName): void {
  }

  registerPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
  }

  unregisterPlatformAccessories(pluginIdentifier: PluginIdentifier, platformName: PlatformName, accessories: PlatformAccessory[]): void {
  }

  updatePlatformAccessories(accessories: PlatformAccessory[]): void {
  }
}
/*
const testApi = new TestApi()
// @ts-ignore
const processor = new CrestronCrossColoursPlatform(new TestLogger(),{
      "platform": "CrestronCrossColours",
      "name": "CrestronCrossColours",
      "ipAddress": '192.168.0.249',
      "port": 41900,
      "accessories": [
        {
          "id": 1,
          "services": ["Lightbulb"],
          "displayName": "Marcus Sidelight"
        },
        {
          "id": 2,
          "services": ["Lightbulb"],
          "displayName": "Casey Sidelight"
        },
        {
          "id": 3,
          "services": ["Lightbulb"],
          "displayName": "Bathroom"
        },
      ]
  },testApi);
 */
