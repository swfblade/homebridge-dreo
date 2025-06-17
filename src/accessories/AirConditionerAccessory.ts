// src/accessories/AirConditionerAccessory.ts

import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DreoPlatform } from '../platform';

export class AirConditionerAccessory {
  private service: Service;
  private readonly Characteristic = this.platform.Characteristic;

  constructor(
    private readonly platform: DreoPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: any
  ) {
    const name = this.device.deviceName || 'Dreo Air Conditioner';

    this.service = this.accessory.getService(this.platform.Service.HeaterCooler)
      || this.accessory.addService(this.platform.Service.HeaterCooler, name);

    this.service.setCharacteristic(this.Characteristic.Name, name);

    this.service.getCharacteristic(this.Characteristic.Active)
      .on('set', this.setActive.bind(this))
      .on('get', this.getActive.bind(this));

    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .on('get', this.getCurrentTemperature.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetTemperature)
      .on('set', this.setTargetTemperature.bind(this))
      .on('get', this.getTargetTemperature.bind(this));

    this.service.getCharacteristic(this.Characteristic.CurrentHeaterCoolerState)
      .on('get', this.getCurrentState.bind(this));

    this.service.getCharacteristic(this.Characteristic.TargetHeaterCoolerState)
      .on('set', this.setTargetState.bind(this))
      .on('get', this.getTargetState.bind(this));

    this.service.getCharacteristic(this.Characteristic.SwingMode)
      .on('set', this.setSwingMode.bind(this))
      .on('get', this.getSwingMode.bind(this));

    this.service.getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', this.setFanSpeed.bind(this))
      .on('get', this.getFanSpeed.bind(this));

    this.updateStatus();
    setInterval(this.updateStatus.bind(this), 30000);
  }

  async setActive(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.platform.dreo.sendCommand(this.device, 'poweron', { state: value === 1 });
    callback(null);
  }

  async getActive(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    callback(null, state.poweron.state ? 1 : 0);
  }

  async getCurrentTemperature(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    const f = state.temperature.state;
    const c = ((f - 32) * 5) / 9;
    callback(null, Math.round(c * 10) / 10);
  }

  async getTargetTemperature(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    const f = state.templevel.state;
    const c = ((f - 32) * 5) / 9;
    callback(null, Math.round(c * 10) / 10);
  }

  async setTargetTemperature(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    const f = Math.round((value as number) * 9 / 5 + 32);
    await this.platform.dreo.sendCommand(this.device, 'templevel', { state: f });
    callback(null);
  }

  async getCurrentState(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    const mode = state.mode.state;
    const power = state.poweron.state;
    let result = this.Characteristic.CurrentHeaterCoolerState.INACTIVE;

    if (!power) result = this.Characteristic.CurrentHeaterCoolerState.INACTIVE;
    else if (mode === 1) result = this.Characteristic.CurrentHeaterCoolerState.COOLING;
    else if (mode === 3) result = this.Characteristic.CurrentHeaterCoolerState.IDLE;

    callback(null, result);
  }

  async getTargetState(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    const mode = state.mode.state;
    let value = this.Characteristic.TargetHeaterCoolerState.COOL;

    if (mode === 3) value = this.Characteristic.TargetHeaterCoolerState.FAN_ONLY;
    else if (mode === 5) value = this.Characteristic.TargetHeaterCoolerState.HEAT;

    callback(null, value);
  }

  async setTargetState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    let mode = 1; // Default to cool
    if (value === this.Characteristic.TargetHeaterCoolerState.FAN_ONLY) mode = 3;
    else if (value === this.Characteristic.TargetHeaterCoolerState.HEAT) mode = 5; // eco workaround

    await this.platform.dreo.sendCommand(this.device, 'mode', { state: mode });
    callback(null);
  }

  async setSwingMode(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    await this.platform.dreo.sendCommand(this.device, 'oscmode', { state: value });
    callback(null);
  }

  async getSwingMode(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    callback(null, state.oscmode.state);
  }

  async setFanSpeed(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // Map HomeKit % to windlevel 1–4
    let windlevel = 1;
    if (value > 75) windlevel = 4;
    else if (value > 50) windlevel = 3;
    else if (value > 25) windlevel = 2;
    await this.platform.dreo.sendCommand(this.device, 'windlevel', { state: windlevel });
    callback(null);
  }

  async getFanSpeed(callback: CharacteristicGetCallback) {
    const state = await this.platform.dreo.getState(this.device);
    const windlevel = state.windlevel.state;
    const percent = { 1: 10, 2: 35, 3: 65, 4: 90 }[windlevel] || 50;
    callback(null, percent);
  }

  async updateStatus() {
    const state = await this.platform.dreo.getState(this.device);
    const power = state.poweron.state;
    const temp = ((state.temperature.state - 32) * 5) / 9;
    const target = ((state.templevel.state - 32) * 5) / 9;
    const windlevel = state.windlevel.state;
    const percent = { 1: 10, 2: 35, 3: 65, 4: 90 }[windlevel] || 50;

    this.service.updateCharacteristic(this.Characteristic.Active, power ? 1 : 0);
    this.service.updateCharacteristic(this.Characteristic.CurrentTemperature, Math.round(temp * 10) / 10);
    this.service.updateCharacteristic(this.Characteristic.TargetTemperature, Math.round(target * 10) / 10);
    this.service.updateCharacteristic(this.Characteristic.RotationSpeed, percent);
  }
}
