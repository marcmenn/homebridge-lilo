import { Device, GattCharacteristic } from 'node-ble'
import Debugger from '../debug.js'
import CommandQueue from './CommandQueue.js'

const debug = Debugger('BasePeripheral')

const SERVICE_DEVICE_INFORMATION = '0000180a-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_FIRMWARE_REVISION = '00002a26-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_MANUFACTURER_NAME = '00002a29-0000-1000-8000-00805f9b34fb'

const DISCONNECT_TIMEOUT = 30 * 1000

export default class BasePeripheral extends CommandQueue {
  private readonly device: Device

  private readonly cache = new Map<string, Promise<GattCharacteristic>>()

  constructor(device: Device) {
    super()
    this.device = device
    this._timeout = DISCONNECT_TIMEOUT
  }

  protected async start(): Promise<void> {
    if (!await this.device.isConnected()) {
      await this.device.connect()
    }
  }

  protected async stop(): Promise<void> {
    if (await this.device.isConnected()) {
      debug('disconnecting from %s', await this.device.toString())
      await this.device.disconnect()
    }
  }

  protected async withCharacteristic<V>(
    serviceUuid: string,
    characteristicUuid: string,
    callback: (characteristic: GattCharacteristic) => Promise<V>,
  ): Promise<V> {
    return this.push(async () => {
      const cacheKey = `${serviceUuid} : ${characteristicUuid}`
      let characteristic = this.cache.get(cacheKey)
      if (!characteristic) {
        characteristic = this.getCharacteristic(serviceUuid, characteristicUuid)
        this.cache.set(cacheKey, characteristic)
      }
      return callback(await characteristic)
    })
  }

  private async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<GattCharacteristic> {
    debug('Discovering characteristic %s of service %s', characteristicUuid, serviceUuid)
    const { device } = this
    if (!device) throw new Error('Not connected')
    const gattServer = await device.gatt()
    const service = await gattServer.getPrimaryService(serviceUuid)
    const characteristic = await service.getCharacteristic(characteristicUuid)
    if (!characteristic) throw new Error(`Characteristic ${characteristicUuid} not found`)
    return characteristic
  }

  async getManufacturerName(): Promise<string> {
    return this.withCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_MANUFACTURER_NAME, async (name) => {
      const b = await name.readValue()
      return b.toString()
    })
  }

  async getFirmwareRevision(): Promise<string> {
    return this.withCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_FIRMWARE_REVISION, async (revision) => {
      const b = await revision.readValue()
      return b.toString()
    })
  }
}
