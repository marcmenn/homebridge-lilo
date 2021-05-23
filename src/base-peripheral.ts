import {Characteristic, Peripheral} from '@abandonware/noble'
import {LiloLogger} from "./lilo-logger";

const CHARACTERISTIC_FIRMWARE_REVISION = '2a26'
const CHARACTERISTIC_MANUFACTURER_NAME = '2a29'

const DISCONNECT_TIMEOUT = 120

const discoverCharacteristics = async (peripheral: Peripheral) => {
  const {characteristics} = await peripheral.discoverAllServicesAndCharacteristicsAsync()
  return characteristics
}

export default class BasePeripheral {
  protected log: LiloLogger = console
  private _peripheral: Peripheral
  private _characteristics: Promise<Array<Characteristic>> | null = null
  private _disconnectTimeoutId: NodeJS.Timeout | null = null
  private _running: Promise<void> = Promise.resolve()

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
    switch (this._peripheral.state) {
      case 'disconnected':
        this.log.info('connecting to %s', this.id)
        return this._peripheral.connectAsync()
      case 'error':
        throw new Error('Peripheral is in error state')
      case 'connecting':
        return new Promise((resolve) => {
          this._peripheral.once('connect', () => {
            resolve()
          })
        })
      case 'connected':
        return Promise.resolve()
      case 'disconnecting':
        return new Promise((resolve) => {
          this._peripheral.once('disconnect', () => {
            this.log.info('reconnecting to %s', this.id)
            resolve(this._peripheral.connectAsync())
          })
        })
      default:
        throw new Error(`Unknown peripheral state: ${this._peripheral.state}`)
    }
  }

  clearDisconnectTimeout(): void {
    if (this._disconnectTimeoutId) {
      clearTimeout(this._disconnectTimeoutId)
      this._disconnectTimeoutId = null
    }
  }

  async disconnect(): Promise<void> {
    if (this._peripheral.state === 'disconnected' || this._peripheral.state === 'disconnecting') return
    this.log.info('disconnecting from %s', this.id)
    this.clearDisconnectTimeout()
    this._characteristics = null
    this._running = Promise.resolve()
    await this._peripheral.disconnectAsync()
  }

  scheduleDisconnect(): void {
    this.clearDisconnectTimeout()
    this._disconnectTimeoutId = setTimeout(() => {
      this.disconnect()
    }, DISCONNECT_TIMEOUT * 1000)
  }

  async withConnectedCharacteristic<V>(uuid: string, fn: (characteristic: Characteristic) => Promise<V>): Promise<V> {
    this.clearDisconnectTimeout()

    const exec = async () => {
      await this.doConnect()
      if (!this._characteristics) {
        this._characteristics = discoverCharacteristics(this._peripheral)
      }
      const characteristics = await this._characteristics
      const characteristic = characteristics.find(({uuid: id}) => id === uuid)
      if (!characteristic) throw new Error(`Characteristic ${uuid} not found`)
      return await fn(characteristic)
    }

    const wait = async (start: Promise<void>): Promise<void> => {
      try {
        await start
        // eslint-disable-next-line no-empty
      } catch (e) {
      }
      try {
        await result
        // eslint-disable-next-line no-empty
      } catch (e) {
      }
      if (this._running === promise) this.scheduleDisconnect()
    }

    const result = exec()
    const promise = this._running = wait(this._running)
    return await result
  }

  async getManufacturerName(): Promise<string | undefined> {
    return await this.withConnectedCharacteristic(CHARACTERISTIC_MANUFACTURER_NAME, async (name: Characteristic) => {
      if (!name) return undefined
      const b = await name.readAsync()
      return b.toString()
    })
  }

  async getFirmwareRevision(): Promise<string | undefined> {
    return await this.withConnectedCharacteristic(CHARACTERISTIC_FIRMWARE_REVISION, async (revision: Characteristic) => {
      if (!revision) return undefined
      const b = await revision.readAsync()
      return b.toString()
    })
  }

}
