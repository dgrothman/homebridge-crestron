import {
  API,
  APIEvent,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP,
  Logging,
  PlatformAccessory,
  PlatformAccessoryEvent,
  PlatformConfig,
  PlatformIdentifier,
  PlatformName,
  Service
} from "homebridge";
import {Socket} from "net";

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
  accessories: CrossColourAccessory[];
}
interface CrossColourAccessory extends PlatformAccessory {
  id: number;
  type: string;
  subtype: string;
}
class CrestronCrossColoursPlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly api: API;
  private readonly config: CrestronCrossColoursConfig;
  private accessories: any[] = [];
  readonly processor: CrestronProcessor;

  constructor(log: Logging, config: CrestronCrossColoursConfig, api: API) {
    this.log = log;
    this.api = api;
    this.accessories = [];
    this.config = config;

    this.processor = new CrestronProcessor(config.ipAddress, config.port, log, false);
    log.info("CCCP finished initializing!");

    /*
     * When this event is fired, homebridge restored all cached accessories from disk and did call their respective
     * `configureAccessory` method for all of them. Dynamic Platform plugins should only register new accessories
     * after this event was fired, in order to ensure they weren't added to homebridge already.
     * This event can also be used to start discovery of new accessories.
     */
    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      log.info("CrestronCrossColours platform 'didFinishLaunching'");
      // Remove deleted ones
      let requireRemoval = [];
      this.accessories.forEach((accessory) => {
        if(!this.config.accessories.find(existing => existing.displayName === accessory.displayName)) {
          this.log.info(`Removing accessory not found in config ${accessory.displayName}`);
          requireRemoval.push(new this.api.platformAccessory(accessory.displayName, accessory.UUID));
        }
      });
      this.log.info(`Removing ${requireRemoval.length} items`);
      requireRemoval.forEach(item => {
        this.accessories = this.accessories.filter(obj => obj !== item);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME,PLATFORM_NAME,requireRemoval);
      })

      // Add new ones
      this.config.accessories.forEach((accessory) => {
        if(!this.accessories.find(existing => existing.displayName === accessory.displayName)) {

          this.addAccessory(accessory)
        }
      });
    });
  };

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log(`Configuring accessory ${accessory.displayName} with UUID ${accessory.UUID}`);
    if(accessory.UUID === undefined) {
      accessory.UUID = this.api.hap.uuid.generate(accessory.displayName);
    }

    if(!this.config.accessories.find(existing => existing.displayName === accessory.displayName)) {
      this.log.info(`Ignoring removed accessory not found in config ${accessory.displayName}`);
      return;
    }

    this.accessories.push(accessory);
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log(`${accessory.displayName} identified!`);
    });

    this.log(`Setting up accessory type of ${accessory.context.type}`);
    switch (accessory.context.type) {
      case 'Lightbulb':
        this.log.info(`Found a Lightbulb accessory to configure`);
        const lightbulbService = accessory.getService(hap.Service.Lightbulb);
        lightbulbService!.getCharacteristic(hap.Characteristic.On)
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.log.info(`${accessory.displayName} Light was set to: ${value}`);
              accessory.context.power = (value > 0);
              if (accessory.context.power && accessory.context.bri == 0) {
                accessory.context.bri = 100;
              } else {
                accessory.context.bri = 0;
              }
              this.processor.loadDim(accessory.context.id, +!!accessory.context.power * accessory.context.bri);
              callback(null);
            })
            .on(hap.CharacteristicEventTypes.GET, (callback) => {
              this.log.debug(`getPower ${accessory.context.id} = ${accessory.context.power}`);
              callback(null, accessory.context.power);
            });
            if(accessory.context.subtype == "dimmer" || accessory.context.subtype == "rgb") {
              lightbulbService.getCharacteristic(hap.Characteristic.Brightness)
                  .on(hap.CharacteristicEventTypes.SET, (level : CharacteristicValue, callback: CharacteristicSetCallback) => {
                    this.log.debug(`setBrightness ${accessory.context.id} = ${level}`);
                    accessory.context.bri = parseInt(level.toString());
                    accessory.context.power = (accessory.context.bri > 0);
                    this.processor.loadDim(accessory.context.id, +!!accessory.context.power * accessory.context.bri);
                    callback(null);
                  })
                  .on(hap.CharacteristicEventTypes.GET, (callback) => {
                    this.log(`getBrightness ${accessory.context.id} = ${accessory.context.bri}`);
                    callback(null, accessory.context.bri);
                  })
            }
            if (accessory.context.subtype == "rgb") {
              lightbulbService.getCharacteristic(hap.Characteristic.Saturation)
                  .on(hap.CharacteristicEventTypes.SET, (level, callback) => {
                    accessory.context.power = true;
                    accessory.context.sat = level;
                    this.processor.rgbLoadDissolveHSL(accessory.context.id, accessory.context.hue, accessory.context.sat, accessory.context.bri)
                    callback(null);
                  })
                  .on(hap.CharacteristicEventTypes.GET, (callback) => {
                    callback(null, accessory.context.sat);
                  });
              lightbulbService.getCharacteristic(hap.Characteristic.Hue)
                  .on(hap.CharacteristicEventTypes.SET, (level, callback) => {
                    accessory.context.power = true;
                    accessory.context.hue = level;
                    this.processor.rgbLoadDissolveHSL(accessory.context.id, accessory.context.hue, accessory.context.sat, accessory.context.bri)
                    callback(null);
                  })
                  .on(hap.CharacteristicEventTypes.GET, (callback) => {
                    callback(null, accessory.context.hue);
                  });
            }
        break;
      case 'WindowCovering':
        this.log.info(`Found a WindowCovering accessory to configure`);
        accessory.getService(hap.Service.WindowCovering)!.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.log.info(`${accessory.displayName} WindowCovering was set to: ${value}`);
              callback();
            });
        break;
    }
  }

  // --------------------------- CUSTOM METHODS ---------------------------

  addAccessory(accessory: CrossColourAccessory) {
    this.log.info(`Adding new accessory with name ${accessory.displayName}`);

    // uuid must be generated from a unique but not changing data source, name should not be used in the most cases. But works in this specific example.
    const uuid = hap.uuid.generate(accessory.displayName);
    const newAccessory = new Accessory(accessory.displayName, uuid);
    newAccessory.context.id = accessory.id;
    newAccessory.context.type = accessory.type
    newAccessory.context.subtype = accessory.subtype;
    const service = new Service.AccessoryInformation();
    service.setCharacteristic(hap.Characteristic.Name, accessory.displayName)
        .setCharacteristic(hap.Characteristic.Manufacturer, "Crestron")
        .setCharacteristic(hap.Characteristic.Model, accessory.type + " Device")
        .setCharacteristic(hap.Characteristic.SerialNumber, "ID " + accessory.id);

    switch (accessory.type) {
      case 'Lightbulb':
        newAccessory.addService(Service.Lightbulb,accessory.displayName);
        newAccessory.context.bri = 100;
        newAccessory.context.power = false;
        newAccessory.context.sat = 0;
        newAccessory.context.hue = 0;
        break;
      case 'WindowCovering':
        newAccessory.addService(Service.WindowCovering,accessory.displayName);
        break;
    }

    this.configureAccessory(newAccessory); // abusing the configureAccessory here

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [newAccessory]);
  }
  // ----------------------------------------------------------------------

}
class CrestronProcessor {
  private readonly ipAddress: string;
  private readonly port: number;
  private client: Socket = new Socket();
  private readonly log: Logging;

  constructor(ipAddress: string, port: number, log: Logging, useCache: boolean) {
    this.ipAddress = ipAddress;
    this.port = port;
    this.log = log;
    this.connectToServer();
  }

  connectToServer() {
    this.log.info(`CCCP connection info: ${this.ipAddress}:${this.port}`);
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
    this.client.on('close',async function () {
      this.log.info('connection closed');
      try {
        //await(500);
        //this.client.connect(this.port, this.ipAddress);
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

  loadDim(id, level, time?) {
    var thisTime = time || 1;
  }
  rgbLoadDissolveHSL(id, h, s, l, time?) {
    var thisTime = time || 500;
  }
  getLoadStatus(id) {

  }
}
