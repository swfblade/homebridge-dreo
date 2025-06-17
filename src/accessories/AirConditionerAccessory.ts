import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DreoPlatform } from '../platform';
import { BaseAccessory } from './BaseAccessory';

export class AirConditionerAccessory extends BaseAccessory {
  private service: Service;
  private readonly Characteristic = this.platform.Characteristic;

  constructor(
    protected readonly platform: DreoPlatform,
    protected readonly accessory: PlatformAccessory,
    protected device: any
  ) {
    super(platform, accessory, device);

    const name = this.device.deviceName || 'Dreo Air Conditioner';

    this.service = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler, name);

    this.service.setCharacteristic(this.Characteristic.Name, name);

    this.service.getCharacteristic(this.Characteristic.Active)
      .onSet(this.setActive.bind(this))
      .onGet(this.getActive.bind(this));

    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetTemperature)
      .onSet(this.setTargetTemperature.bind(this))
      .onGet(this.getTargetTemperature.bind(this));

    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .onGet(this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .onSet(this.setTargetState.bind(this))
      .onGet(this.getTargetState.bind(this));

    this.service.getCharacteristic(this.Characteristic.SwingMode)
      .onSet(this.setSwingMode.bind(this))
      .onGet(this.getSwingMode.bind(this));

    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .onSet(this.setFanSpeed.bind(this))
      .onGet(this.getFanSpeed.bind(this));

    setTimeout(() => this.updateStatus(), 5000);
    setInterval(this.updateStatus.bind(this), 30000);
  }

  async setActive(value: CharacteristicValue) {
    await this.platform.dreoApi.sendCommand(this.device.device_sn, 'set', 'poweron', value === 1);
  }

  async getActive(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    return state.poweron.state ? 1 : 0;
  }

  async getCurrentTemperature(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    const f = state.temperature.state;
    const c = ((f - 32) * 5) / 9;
    return Math.round(c * 10) / 10;
  }

  async getTargetTemperature(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    const f = state.templevel.state;
    const c = ((f - 32) * 5) / 9;
    return Math.round(c * 10) / 10;
  }

  async setTargetTemperature(value: CharacteristicValue) {
    const f = Math.round((value as number) * 9 / 5 + 32);
    await this.platform.dreoApi.sendCommand(this.device.device_sn, 'set', 'templevel', f);
  }

  async getCurrentState(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    return state.poweron.state ? this.Characteristic.CurrentHeaterCoolerState.COOLING
                               : this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
  }

  async getTargetState(): Promise<CharacteristicValue> {
    return this.Characteristic.TargetHeaterCoolerState.COOL;
  }

  async setTargetState(value: CharacteristicValue) {
    // Currently hardcoded to COOL mode
  }

  async setSwingMode(value: CharacteristicValue) {
    await this.platform.dreoApi.sendCommand(this.device.device_sn, 'set', 'swing', value === 1);
  }

  async getSwingMode(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    return state.swing.state ? 1 : 0;
  }

  async setFanSpeed(value: CharacteristicValue) {
    await this.platform.dreoApi.sendCommand(this.device.device_sn, 'set', 'fanspeed', value);
  }

  async getFanSpeed(): Promise<CharacteristicValue> {
    const state = await this.platform.webHelper.getState(this.device);
    return state.fanspeed?.state || 0;
  }

  async updateStatus() {
    const state = await this.platform.webHelper.getState(this.device);
    this.service.updateCharacteristic(this.Characteristic.Active, state.poweron.state ? 1 : 0);
    const f = state.temperature.state;
    const c = ((f - 32) * 5) / 9;
    this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, Math.round(c * 10) / 10);
  }
}
