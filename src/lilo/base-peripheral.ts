import { Characteristic, Peripheral } from '@abandonware/noble'
import Debugger from 'debug'
import CommandQueue from './command-queue.js'
import connect from './connect.js'

const debug = Debugger('LILO.Peripheral')

const CHARACTERISTIC_FIRMWARE_REVISION = '2a26'
const CHARACTERISTIC_MANUFACTURER_NAME = '2a29'

const DISCONNECT_TIMEOUT = 30 * 1000

const discoverCharacteristics = async (peripheral: Peripheral) => {
  const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync()
  return characteristics
}

export default class BasePeripheral {
  private readonly queue

  private readonly _peripheral: Peripheral

  private _characteristics: Promise<Array<Characteristic>> | null = null

  constructor(peripheral: Peripheral) {
    this._peripheral = peripheral
    this.queue = new CommandQueue(
      DISCONNECT_TIMEOUT,
      () => connect(this._peripheral, this.id),
      async () => {
        if (this._peripheral.state === 'disconnected' || this._peripheral.state === 'disconnecting') return
        debug('disconnecting from %s', this.id)
        this._characteristics = null
        await this._peripheral.disconnectAsync()
      },
    )
  }

  get id(): string {
    return this._peripheral.id
  }

  get localName(): string {
    return this._peripheral.advertisement.localName
  }

  async disconnect(): Promise<void> {
    await this.queue.close()
  }

  async withConnectedCharacteristic<V>(uuid: string, fn: (characteristic: Characteristic) => Promise<V>): Promise<V> {
    return this.queue.push(async () => {
      if (!this._characteristics) {
        this._characteristics = discoverCharacteristics(this._peripheral)
      }
      const characteristics = await this._characteristics
      const characteristic = characteristics.find(({ uuid: id }) => id === uuid)
      if (!characteristic) throw new Error(`Characteristic ${uuid} not found`)
      return fn(characteristic)
    })
  }

  async getManufacturerName(): Promise<string | undefined> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_MANUFACTURER_NAME, async (name: Characteristic) => {
      if (!name) return undefined
      const b = await name.readAsync()
      return b.toString()
    })
  }

  async getFirmwareRevision(): Promise<string | undefined> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_FIRMWARE_REVISION, async (revision: Characteristic) => {
      if (!revision) return undefined
      const b = await revision.readAsync()
      return b.toString()
    })
  }
}
