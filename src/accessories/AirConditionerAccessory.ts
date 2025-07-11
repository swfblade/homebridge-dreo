import { Service, CharacteristicValue } from 'homebridge';
import { BaseAccessory } from './BaseAccessory';

export class AirConditionerAccessory extends BaseAccessory {
  private service: Service;
  private device: any;

  constructor(platform, accessory, device) {
    super(platform, accessory);
    this.device = device;

    this.service = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler);

    this.service.setCharacteristic(this.platform.Characteristic.Name, device.deviceName || 'Dreo AC');

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getActiveState.bind(this))
      .onSet(this.setActiveState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentHeaterCoolerState.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.TargetHeaterCoolerState)
      .onSet(this.setTargetHeaterCoolerState.bind(this))
      .onGet(this.getTargetHeaterCoolerState.bind(this))
      .setProps({
        validValues: [
          this.platform.Characteristic.TargetHeaterCoolerState.COOL,
          this.platform.Characteristic.TargetHeaterCoolerState.HEAT
        ]
      });

    this.service.getCharacteristic(this.platform.Characteristic.CoolingThresholdTemperature)
      .onGet(this.getCoolingTemp.bind(this))
      .onSet(this.setCoolingTemp.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 80,
        minStep: 0.1,
      });

    this.service.getCharacteristic(this.platform.Characteristic.RotationSpeed)
      .setProps({ minValue: 0, maxValue: 100, minStep: 1 })
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));


/**    this.service.getCharacteristic(this.platform.Characteristic.SwingMode)
      .onGet(this.getSwingMode.bind(this))
      .onSet(this.setSwingMode.bind(this));
*/
  }

  getActive(): boolean {
    return this.device.poweron ?? false;
  }

  setActive(value: boolean): void {
    this.platform.log.info(`[AirCon] Abstract setActive(${value})`);
  }

  private async getActiveState(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    return state.poweron?.state
      ? this.platform.Characteristic.Active.ACTIVE
      : this.platform.Characteristic.Active.INACTIVE;
  }

  private async setActiveState(value: CharacteristicValue): Promise<void> {
    const active = value === this.platform.Characteristic.Active.ACTIVE;
    this.platform.log.info(`[AirCon] Set Active: ${active}`);
    await this.platform.webHelper.control(this.device.sn, { poweron: active });
  }

  private async getCurrentHeaterCoolerState(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    this.platform.log.info('[AirCon] FULL state snapshot: ' + JSON.stringify(state));

    const mode = state.mode?.state;
    const power = state.poweron?.state;

    this.platform.log.info(`[AirCon] DEBUG getCurrentHeaterCoolerState: mode = ${mode}, power = ${power}`);

    if (!power) {
      return this.platform.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    }

    switch (mode) {
      case 1: // Cooling
        return this.platform.Characteristic.CurrentHeaterCoolerState.COOLING;

      case 2: // Dehumidify
      case 3: // Fan
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;

      default:
        return this.platform.Characteristic.CurrentHeaterCoolerState.IDLE;
    }
  }

  private async getTargetHeaterCoolerState(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    const mode = state.mode?.state;

    switch (mode) {
      case 1: // Cooling
        return this.platform.Characteristic.TargetHeaterCoolerState.COOL;
      case 2: // Dehumidify (previously AUTO)
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT; // using HEAT to represent dry
      case 3: // Fan
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT; // fallback
      default:
        return this.platform.Characteristic.TargetHeaterCoolerState.HEAT;
    }
  }

  private async setTargetHeaterCoolerState(value: CharacteristicValue): Promise<void> {
    let mode = 'coolair';

    switch (value) {
      case this.platform.Characteristic.TargetHeaterCoolerState.COOL:
        mode = 'coolair';
        break;
      case this.platform.Characteristic.TargetHeaterCoolerState.HEAT:
        mode = 'dehumidify'; // or 'fan', depending on what you're mapping HEAT to
        break;
      default:
        this.platform.log.warn(`[AirCon] Unsupported mode value (${value}), defaulting to COOL`);
        mode = 'coolair';
    }

    this.platform.log.info(`[AirCon] Set mode to ${mode}`);
    await this.platform.webHelper.control(this.device.sn, { mode: { state: mode } });
  }

  private async getCoolingTemp(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    const temp = state.templevel?.state;

    if (typeof temp === 'number') {
      const celsius = (temp - 32) * 5 / 9;
      this.platform.log.info(`[AirCon] Reporting cooling setpoint: ${celsius.toFixed(1)}°C`);
      return parseFloat(celsius.toFixed(1));
    }

    this.platform.log.warn(`[AirCon] Cooling setpoint not available, defaulting to 22°C`);
    return 22;
  }

  private async setCoolingTemp(value: CharacteristicValue): Promise<void> {
    const celsius = typeof value === 'number' ? value : parseFloat(value.toString());
    const fahrenheit = Math.ceil((celsius * 9 / 5) + 32);
    this.platform.log.info(`[AirCon] Setting cooling setpoint to ${celsius}°C (${fahrenheit}°F)`);

    await this.platform.webHelper.control(this.device.sn, { templevel: fahrenheit });
  }


  private async getCurrentTemperature(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);

    this.platform.log.info(`[AirCon] Full device state: ${JSON.stringify(state)}`);

    let temperature = Number(state.temperature?.state);

    // Convert Fahrenheit to Celsius if needed
    temperature = Math.ceil(((temperature - 32) * 5) / 9);

    if (isNaN(temperature)) {
      this.platform.log.warn(`[AirCon] Invalid temperature value in state: ${JSON.stringify(state.temperature)}`);
      temperature = 69;
    }

    this.platform.log.info(`[AirCon] Reporting current temperature: ${temperature}°C`);
    return temperature;
  }

  private async getRotationSpeed(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    const speed = state.windlevel?.state ?? 4;

    let percentage = 100; // default to Auto
    switch (speed) {
      case 1: percentage = 10; break;
      case 2: percentage = 35; break;
      case 3: percentage = 60; break;
      case 4: percentage = 85; break;
    }

    this.platform.log.info(`[AirCon] Current fan speed: windlevel ${speed}, reporting ${percentage}%`);
    return percentage;
  }

  private async setRotationSpeed(value: CharacteristicValue): Promise<void> {
    const percent = Number(value);
    let windlevel = 4; // Auto by default

    if (percent < 25) windlevel = 1;
    else if (percent < 50) windlevel = 2;
    else if (percent < 75) windlevel = 3;

    this.platform.log.info(`[AirCon] Set fan speed: ${percent}% → windlevel ${windlevel}`);
    await this.platform.webHelper.control(this.device.sn, { windlevel });
  }

/**  private async getSwingMode(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device.sn);
    const osc = state.oscmode?.state;

    const result = osc === 1
      ? this.platform.Characteristic.SwingMode.SWING_ENABLED
      : this.platform.Characteristic.SwingMode.SWING_DISABLED;

    this.platform.log.info(`[AirCon] Current Swing Mode: ${osc} → ${result}`);
    return result;
  }

  private async setSwingMode(value: CharacteristicValue): Promise<void> {
    const swing = value === this.platform.Characteristic.SwingMode.SWING_ENABLED ? 2 : 0;

    this.platform.log.info(`[AirCon] Set Swing Mode to ${swing}`);
    await this.platform.webHelper.control(this.device.sn, { oscmode: { state: swing } });
  }*/

}
