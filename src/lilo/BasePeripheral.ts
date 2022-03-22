import noble, { Characteristic, Peripheral } from '@abandonware/noble'
import Debugger from '../debug.js'
import CommandQueue from './CommandQueue.js'
import connect from './connect.js'

const debug = Debugger('BasePeripheral')

const SERVICE_DEVICE_INFORMATION = '180a'
const CHARACTERISTIC_FIRMWARE_REVISION = '2a26'
const CHARACTERISTIC_MANUFACTURER_NAME = '2a29'

const DISCONNECT_TIMEOUT = 30 * 1000

export default class BasePeripheral extends CommandQueue {
  static startDiscovery(onDiscover: (peripheral: Peripheral) => void): () => Promise<void> {
    const onStateChange = (state: string) => {
      debug('BLE state change to %s', state)
      if (state === 'poweredOn') {
        debug('Initiating scan')
        noble.startScanning([], false, (error) => {
          if (error) {
            debug('Error initiating scan: %s', error)
          }
        })
      }
    }

    noble.on('discover', onDiscover)
    noble.on('stateChange', onStateChange)
    onStateChange(noble.state)

    return async () => {
      debug('stop scanning')
      noble.removeListener('stateChange', onStateChange)
      noble.removeListener('discover', onDiscover)
      await noble.stopScanningAsync()
    }
  }

  private readonly _peripheral: Peripheral

  constructor(peripheral: Peripheral) {
    super()
    this._timeout = DISCONNECT_TIMEOUT
    this._peripheral = peripheral
  }

  protected async start(): Promise<void> {
    await connect(this._peripheral, this._peripheral.id)
  }

  protected async stop(): Promise<void> {
    if (this._peripheral.state === 'disconnected' || this._peripheral.state === 'disconnecting') return
    debug('disconnecting from %s', this._peripheral.id)
    await this._peripheral.disconnectAsync()
  }

  protected async withCharacteristic<V>(
    serviceUuid: string,
    characteristicUuid: string,
    callback: (characteristic: Characteristic) => Promise<V>,
  ): Promise<V> {
    return this.push(async () => {
      const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid)
      return callback(characteristic)
    })
  }

  protected async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<Characteristic> {
    debug('Discovering characteristic %s of service %s', characteristicUuid, serviceUuid)
    const { characteristics } = await this._peripheral.discoverSomeServicesAndCharacteristicsAsync([serviceUuid], [characteristicUuid])
    const characteristic = characteristics.find(({ uuid: id }) => id === characteristicUuid)
    if (!characteristic) throw new Error(`Characteristic ${characteristicUuid} not found`)
    return characteristic
  }

  async getManufacturerName(): Promise<string> {
    return this.withCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_MANUFACTURER_NAME, async (name) => {
      const b = await name.readAsync()
      return b.toString()
    })
  }

  async getFirmwareRevision(): Promise<string> {
    return this.withCharacteristic(SERVICE_DEVICE_INFORMATION, CHARACTERISTIC_FIRMWARE_REVISION, async (revision) => {
      const b = await revision.readAsync()
      return b.toString()
    })
  }
}
