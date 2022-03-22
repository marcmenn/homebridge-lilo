import NodeBle, { createBluetooth, Device, GattCharacteristic } from 'node-ble'
import Debugger from '../debug.js'
import CommandQueue from './CommandQueue.js'

const debug = Debugger('BasePeripheral')

const SERVICE_DEVICE_INFORMATION = '0000180a-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_FIRMWARE_REVISION = '00002a26-0000-1000-8000-00805f9b34fb'
const CHARACTERISTIC_MANUFACTURER_NAME = '00002a29-0000-1000-8000-00805f9b34fb'

const DISCONNECT_TIMEOUT = 30 * 1000

export default class BasePeripheral extends CommandQueue {
  static startDiscovery(onDiscover: (uuid: string, device: Device) => Promise<void>): () => void {
    const { bluetooth, destroy } = createBluetooth()
    let adapter: NodeBle.Adapter | null = null

    const knownUuids = new Set<string>()
    let counter = 60

    const runOnDiscover = async (uuid: string): Promise<void> => {
      if (knownUuids.has(uuid) || !adapter) return

      knownUuids.add(uuid)
      const device = await adapter.getDevice(uuid)
      await onDiscover(uuid, device)
    }

    const discoverer = async () => {
      if (!adapter) {
        adapter = await bluetooth.defaultAdapter()
        if (!await adapter.isDiscovering()) await adapter.startDiscovery()
      }
      const uuids = await adapter.devices()
      await Promise.all(uuids.map(runOnDiscover))
    }

    const stopScanning = () => {
      counter = 0
    }

    const timeout = () => {
      if (counter <= 0) {
        debug('stop scanning')
        const a = adapter
        adapter = null
        if (a) {
          a.isDiscovering().then((bool) => (bool ? a.stopDiscovery() : null)).catch((e) => {
            debug('Error stop scanning: ', e)
          }).finally(() => {
            destroy()
          })
        }
        return
      }
      counter -= 1
      discoverer().then(() => {
        if (counter >= 0) {
          setTimeout(timeout, 1000)
        }
      })
    }

    timeout()

    return stopScanning
  }

  private uuid: string

  private device?: Device

  private destroy?: () => void

  constructor(uuid: string) {
    super()
    this._timeout = DISCONNECT_TIMEOUT
    this.uuid = uuid
  }

  protected async start(): Promise<void> {
    const { bluetooth, destroy } = createBluetooth()
    this.destroy = destroy
    const adapter = await bluetooth.defaultAdapter()
    const device = await adapter.waitDevice(this.uuid)
    if (!await device.isConnected()) {
      await device.connect()
    }
    this.device = device
  }

  protected async stop(): Promise<void> {
    const { destroy, device } = this
    this.destroy = undefined
    this.device = undefined
    if (device && await device.isConnected()) {
      debug('disconnecting from %s', this.uuid)
      await device.disconnect()
    }
    if (destroy) destroy()
  }

  protected async withCharacteristic<V>(
    serviceUuid: string,
    characteristicUuid: string,
    callback: (characteristic: GattCharacteristic) => Promise<V>,
  ): Promise<V> {
    return this.push(async () => {
      const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid)
      return callback(characteristic)
    })
  }

  protected async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<GattCharacteristic> {
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
