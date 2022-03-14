import { Characteristic, Peripheral } from '@abandonware/noble'
import Debugger from 'debug'
import CommandQueue from './command-queue.js'
import connect from './connect.js'

const debug = Debugger('LILO.Peripheral')

const SERVICE_DEVICE_INFORMATION = '180a'
const CHARACTERISTIC_FIRMWARE_REVISION = '2a26'
const CHARACTERISTIC_MANUFACTURER_NAME = '2a29'

const DISCONNECT_TIMEOUT = 30 * 1000

export default class BasePeripheral {
  private readonly queue

  private readonly _peripheral: Peripheral

  constructor(peripheral: Peripheral) {
    this._peripheral = peripheral
    const { id } = peripheral
    this.queue = new CommandQueue(
      DISCONNECT_TIMEOUT,
      () => connect(peripheral, id),
      async () => {
        if (peripheral.state === 'disconnected' || peripheral.state === 'disconnecting') return
        debug('disconnecting from %s', id)
        await peripheral.disconnectAsync()
      },
    )
  }

  async disconnect(): Promise<void> {
    await this.queue.close()
  }

  async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<Characteristic> {
    if (this._peripheral.services) {
      const service = this._peripheral.services.find(({ uuid }) => uuid === serviceUuid)
      if (service) {
        const characteristic = service.characteristics.find(({ uuid }) => uuid === characteristicUuid)
        if (characteristic) {
          return characteristic
        }
      }
    }
    const { characteristics } = await this._peripheral.discoverSomeServicesAndCharacteristicsAsync([serviceUuid], [characteristicUuid])
    const characteristic = characteristics.find(({ uuid: id }) => id === characteristicUuid)
    if (!characteristic) throw new Error(`Characteristic ${characteristicUuid} not found`)
    return characteristic
  }

  async execute<V>(fn: () => Promise<V>): Promise<V> {
    return this.queue.push(fn)
  }

  async getManufacturerName(): Promise<string> {
    return this.execute(async () => {
      const name = await this.getCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_MANUFACTURER_NAME)
      const b = await name.readAsync()
      return b.toString()
    })
  }

  async getFirmwareRevision(): Promise<string> {
    return this.execute(async () => {
      const revision = await this.getCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_FIRMWARE_REVISION)
      const b = await revision.readAsync()
      return b.toString()
    })
  }
}
