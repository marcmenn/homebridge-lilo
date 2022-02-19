import { Characteristic, Peripheral } from '@abandonware/noble'
import CommandQueue from './command-queue.js'
import { LiloLogger } from './lilo-logger.js'

const CHARACTERISTIC_FIRMWARE_REVISION = '2a26'
const CHARACTERISTIC_MANUFACTURER_NAME = '2a29'

const DISCONNECT_TIMEOUT = 30 * 1000
const CONNECT_TIMEOUT = 90 * 1000

const discoverCharacteristics = async (peripheral: Peripheral) => {
  const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync()
  return characteristics
}

export default class BasePeripheral {
  protected log: LiloLogger = console

  private readonly queue = new CommandQueue(DISCONNECT_TIMEOUT, () => this.doConnect(), () => this.disconnect())

  private _peripheral: Peripheral

  private _characteristics: Promise<Array<Characteristic>> | null = null

  constructor(peripheral: Peripheral) {
    this._peripheral = peripheral
  }

  setLogger(log: LiloLogger): void {
    this.log = log
  }

  get id(): string {
    return this._peripheral.id
  }

  get localName(): string {
    return this._peripheral.advertisement.localName
  }

  private doConnect(): Promise<void> {
    let timeout: NodeJS.Timeout | null = null
    switch (this._peripheral.state) {
      case 'disconnected':
        this.log.info('connecting to %s', this.id)
        return new Promise((resolve, reject) => {
          timeout = setTimeout(() => {
            timeout = null
            reject(new Error(`Timeout connecting to ${this.id}`))
            this.log.warn('Timeout connecting to %s', this.id)
            this._peripheral.cancelConnect()
          }, CONNECT_TIMEOUT)
          this._peripheral.connect((error) => {
            if (timeout) {
              clearTimeout(timeout)
              if (error) reject(error)
              resolve()
            }
          })
        })
      case 'error':
        this.log.warn('Peripheral is in error state %s', this.id)
        throw new Error('Peripheral is in error state')
      case 'connecting':
        this.log.info('waiting for connection to %s', this.id)
        return new Promise((resolve) => {
          this._peripheral.once('connect', () => {
            resolve()
          })
        })
      case 'connected':
        this.log.info('already connected to %s', this.id)
        return Promise.resolve()
      case 'disconnecting':
        this.log.info('waiting for disconnect to finish before reconnecting to %s', this.id)
        return new Promise((resolve) => {
          this._peripheral.once('disconnect', () => {
            resolve(this.doConnect())
          })
        })
      default:
        this.log.warn('unknown state of %s: %s', this.id, this._peripheral.state)
        throw new Error(`Unknown peripheral state: ${this._peripheral.state}`)
    }
  }

  async disconnect(): Promise<void> {
    if (this._peripheral.state === 'disconnected' || this._peripheral.state === 'disconnecting') return
    this.log.info('disconnecting from %s', this.id)
    this._characteristics = null
    await this._peripheral.disconnectAsync()
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
