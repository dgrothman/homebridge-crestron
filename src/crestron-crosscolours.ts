import {
  API,
  APIEvent,
  Characteristic,
  CharacteristicEventTypes,
  CharacteristicSetCallback,
  CharacteristicValue,
  DynamicPlatformPlugin,
  HAP, Logger,
  PlatformAccessory,
  PlatformAccessoryEvent, PlatformConfig,
  Service
} from "homebridge";

import {PLATFORM_NAME, PLUGIN_NAME} from "./settings";
import {CrestronProcessor} from "./crestron-processor";

/**
 * HomebridgeCrestronCrosscolours
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class CrestronCrosscolours implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly Processor: CrestronProcessor;
  public readonly HAP: HAP = this.api.hap;
  public readonly Accessory: typeof PlatformAccessory = this.api.platformAccessory;
  // this is used to track restored cached accessories
  public accessories: PlatformAccessory[] = [];

  constructor(
      public readonly log: Logger,
      public readonly config: PlatformConfig,
      public readonly api: API,
  ) {
    // @ts-ignore
    this.Processor = new CrestronProcessor(config.ipAddress, config.port, log, config.slot);
    this.log.debug("CCCP finished initializing!");

    /*
     * When this event is fired, homebridge restored all cached accessories from disk and did call their respective
     * `configureAccessory` method for all of them. Dynamic Platform plugins should only register new accessories
     * after this event was fired, in order to ensure they weren't added to homebridge already.
     * This event can also be used to start discovery of new accessories.
     */
    api.on(APIEvent.DID_FINISH_LAUNCHING, () => {
      this.log.debug("CrestronCrossColours platform 'didFinishLaunching'");
      this.discoverDevices().then(() => {});
    });
  };

  /*
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info(`Configuring accessory ${accessory.displayName} with UUID ${accessory.UUID}`);

    this.accessories.push(accessory);
    accessory.on(PlatformAccessoryEvent.IDENTIFY, () => {
      this.log.info(`${accessory.displayName} identified!`);
    });

    if(accessory.context.type == undefined) return;
    this.log.info(`Setting up accessory type of ${accessory.context.type}`);
    switch (accessory.context.type) {
      case 'Lightbulb':
        this.log.info(`Found a Lightbulb accessory to configure`);
        const lightbulbService = accessory.getService(this.Service.Lightbulb);
        if(lightbulbService === undefined) return;
        lightbulbService!.getCharacteristic(this.Characteristic.On)
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
            this.log.info(`${accessory.displayName} Light was set to: ${value}`);
            accessory.context.power = (value > 0);
            if (accessory.context.power && accessory.context.bri == 0) {
              accessory.context.bri = 100;
            } else {
              accessory.context.bri = 0;
            }
            this.Processor.loadDim(accessory.context.id, +!!accessory.context.power * accessory.context.bri);
            callback(null);
          })
          .on(this.HAP.CharacteristicEventTypes.GET, (callback) => {
            this.log.debug(`getPower ${accessory.context.id} = ${accessory.context.power}`);
            callback(null, accessory.context.power);
          });
        if(accessory.context.subtype == "dimmer" || accessory.context.subtype == "rgb") {
          this.log.info(`Light is dimmable`);
          lightbulbService.getCharacteristic(this.Characteristic.Brightness)
            .on(this.HAP.CharacteristicEventTypes.SET, (level : CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.log.debug(`setBrightness ${accessory.context.id} = ${level}`);
              accessory.context.bri = parseInt(level.toString());
              accessory.context.power = (accessory.context.bri > 0);
              this.Processor.loadDim(accessory.context.id, accessory.context.bri);
              callback(null);
            })
            .on(this.HAP.CharacteristicEventTypes.GET, (callback) => {
              this.log.info(`getBrightness ${accessory.context.id} = ${accessory.context.bri}`);
              accessory.context.bri = this.Processor.getLightLevel(accessory.context.id);
              callback(null, accessory.context.bri);
            })
        }
        if (accessory.context.subtype == "rgb") {
          this.log.info(`Light is rgb`);
          lightbulbService.getCharacteristic(this.Characteristic.Saturation)
            .on(this.HAP.CharacteristicEventTypes.SET, (level, callback) => {
              accessory.context.power = true;
              accessory.context.sat = level;
              this.Processor.loadRgbChange(accessory.context.id, accessory.context.hue, accessory.context.sat, accessory.context.bri)
              callback(null);
            })
            .on(this.HAP.CharacteristicEventTypes.GET, (callback) => {
              accessory.context.sat = this.Processor.getLightSat(accessory.context.id);
              callback(null, accessory.context.sat);
            });
          lightbulbService.getCharacteristic(this.Characteristic.Hue)
            .on(this.HAP.CharacteristicEventTypes.SET, (level, callback) => {
              accessory.context.power = true;
              accessory.context.hue = level;
              this.Processor.loadRgbChange(accessory.context.id, accessory.context.hue, accessory.context.sat, accessory.context.bri)
              callback(null);
            })
            .on(this.HAP.CharacteristicEventTypes.GET, (callback) => {
              accessory.context.hue = this.Processor.getLightHue(accessory.context.id);
              callback(null, accessory.context.hue);
            });
        }
        break;
      case 'WindowCovering':
        this.log.info(`Found a WindowCovering accessory to configure`);
        accessory.getService(this.Service.WindowCovering)!.getCharacteristic(this.Characteristic.TargetPosition)
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
            this.log.info(`${accessory.displayName} WindowCovering was set to: ${value}`);
            accessory.context.position = value;
            this.Processor.setWindowPosition(accessory.context.id,value);
            callback(null);
          })
          .on(CharacteristicEventTypes.GET, (callback) => {
            accessory.context.position = this.Processor.getWindowPosition(accessory.context.id);
            callback(null, accessory.context.position);
          })
        break;
    }
  }

  // --------------------------- CUSTOM METHODS ---------------------------

  addAccessory(accessory: PlatformAccessory) {
    this.log.info(`Adding new accessory with name ${accessory.displayName}`);

    const service = new this.Service.AccessoryInformation();
    service.setCharacteristic(this.Characteristic.Name, accessory.displayName)
        .setCharacteristic(this.Characteristic.Manufacturer, "Crestron")
        .setCharacteristic(this.Characteristic.Model, accessory.context.type + " Device")
        .setCharacteristic(this.Characteristic.SerialNumber, "ID " + accessory.context.id);

    switch (accessory.context.type) {
      case 'Lightbulb':
        accessory.addService(this.Service.Lightbulb,accessory.displayName);
        accessory.context.bri = 100;
        accessory.context.power = false;
        accessory.context.sat = 0;
        accessory.context.hue = 0;
        break;
      case 'WindowCovering':
        accessory.addService(this.Service.WindowCovering,accessory.displayName);
        break;
    }

    this.configureAccessory(accessory); // abusing the configureAccessory here

    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
  }
  // ----------------------------------------------------------------------
    private async discoverDevices() {
      this.log.info('discoverDevices');
      // Get Lights
      const lights = await this.Processor.getLights();
      lights.forEach((load) => {
        const uuid = this.HAP.uuid.generate(`${load.displayName}${load.id}`);
        if(this.accessories.find(accessory => accessory.UUID === uuid)) return;
        this.log.info(`Adding light ${uuid}`);
        const newAccessory = new this.Accessory(`${load.displayName}${load.id}`, uuid);
        newAccessory.context.id = load.id;
        newAccessory.context.type = 'Lightbulb'
        newAccessory.context.subtype = load.subtype;

        this.addAccessory(newAccessory);
      });
      // Get Shades
      const shades = await this.Processor.getShades();
      shades.forEach((load) => {
        const uuid = this.HAP.uuid.generate(`${load.displayName}${load.id}`);
        if(this.accessories.find(accessory => accessory.UUID === uuid)) return;
        const newAccessory = new this.Accessory(`${load.displayName}${load.id}`, uuid);
        newAccessory.context.id = load.id;
        newAccessory.context.type = 'WindowCovering'
        newAccessory.context.subtype = 'shade';

        this.addAccessory(newAccessory);
      });

      // Remove deleted ones
      let requireRemoval: PlatformAccessory[] = [];
      this.accessories.forEach((accessory) => {
        if(accessory.context.type == 'Lightbulb') {
          if(!lights.find(light => light.id == accessory.context.id && accessory.context.type == 'Lightbulb')) {
            this.log.info(`Removing accessory not found in config ${accessory.displayName} ${accessory.context.id}`);
            requireRemoval.push(new this.api.platformAccessory(accessory.displayName, accessory.UUID));
          }
        } else if(accessory.context.type == 'WindowCovering') {
          if(!shades.find(shade => shade.id == accessory.context.id && accessory.context.type == 'WindowCovering')) {
            this.log.info(`Removing accessory not found in config ${accessory.displayName} ${accessory.context.id}`);
            requireRemoval.push(new this.api.platformAccessory(accessory.displayName, accessory.UUID));
          }
        }
      });

      this.log.info(`Removing ${requireRemoval.length} items`);
      requireRemoval.forEach(item => {
          this.accessories = this.accessories.filter(obj => obj !== item);
          this.api.unregisterPlatformAccessories(PLUGIN_NAME,PLATFORM_NAME,[item]);
      });
    }
}
