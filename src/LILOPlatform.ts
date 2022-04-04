import {
  API, HAPStatus, Logger, PlatformAccessory, PlatformConfig,
} from 'homebridge'
import { DynamicPlatformPlugin } from 'homebridge/lib/api.js'
import { Bluetooth, createBluetooth } from 'node-ble'
import { setLog } from './debug.js'
import getOnValue from './getOnValue.js'
import startDiscovery from './lilo/discover.js'
import Lilo, { ADVERTISEMENT_LOCALNAME } from './lilo/Lilo.js'
import setOnValue from './setOnValue.js'

type LILOContext = {
  uuid?: string
}

export default class LILOPlatform implements DynamicPlatformPlugin {
  private log: Logger

  private api: API

  private knownAccessories = new Map<string, PlatformAccessory<LILOContext>>()

  private bluetooth: Bluetooth | null = null

  private destroy: (() => void) | null = null

  private stopDiscovery: (() => Promise<void>) | null = null

  private lilos = new Map<string, Promise<Lilo>>()

  constructor(log: Logger, config: PlatformConfig, api: API) {
    setLog(log.info.bind(log))
    this.log = log
    this.api = api

    api.on('didFinishLaunching', () => {
      this.startBluetooth()
      const allAccessories = [...this.knownAccessories.values()]
      const withUuid = allAccessories.filter(({ context }) => !!context.uuid)
      const withoutUuid = allAccessories.filter(({ context }) => !context.uuid)
      if (withoutUuid.length) {
        this.log.warn('Found %d legacy accessories without uuid, will initialize them on first discovery', withoutUuid.length)
      }
      Promise.all(withUuid.map(async (accessory) => {
        this.log.debug('Eager initialization of %s', accessory.context.uuid)
        await this.initialize(accessory)
      }))
        .catch((e) => {
          log.warn('Error initializing existing accessories', e)
        })
    })

    api.on('shutdown', () => {
      this.stopBluetooth()
    })
  }

  configureAccessory(accessory: PlatformAccessory<LILOContext>) {
    this.knownAccessories.set(accessory.UUID, accessory)
    const {
      HapStatusError, Service, Characteristic,
    } = this.api.hap

    const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    const onCharacteristic = service.getCharacteristic(Characteristic.On)

    onCharacteristic.onSet((value) => {
      this.log.info('Switching to ', Boolean(value))
      this.getLilo(accessory)
        .then((lilo) => setOnValue(lilo, Boolean(value)))
        .catch((e) => {
          this.log.warn('Exception setting OnValue, disconnecting bluetooth', e)
          onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
          this.stopBluetooth()
        })
    })

    const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)

    information.setCharacteristic(Characteristic.Model, 'LILO')
  }

  private startBluetooth(): Bluetooth {
    if (this.bluetooth) return this.bluetooth
    const { bluetooth, destroy } = createBluetooth()
    this.bluetooth = bluetooth
    this.destroy = destroy
    this.startDiscovery().catch((e) => {
      this.log.error('Error starting bluetooth discovery', e)
    })
    return bluetooth
  }

  private async startDiscovery() {
    if (!this.bluetooth) return
    const adapter = await this.bluetooth.defaultAdapter()
    if (!this.bluetooth) return
    this.stopDiscovery = startDiscovery(adapter, async (uuid: string) => {
      if (!this.bluetooth) return
      const uuidAccessory = this.api.hap.uuid.generate(uuid)
      const existingAccessory = this.knownAccessories.get(uuidAccessory)
      if (existingAccessory) {
        if (!existingAccessory.context.uuid) {
          existingAccessory.context.uuid = uuid
          this.log.debug('Lazy initialization of %s', uuid)
          await this.initialize(existingAccessory)
        }
        return
      }

      const device = await adapter.getDevice(uuid)
      const localName = await device.getName().catch(() => 'UNKNOWN') // ignore erroneous devices
      if (ADVERTISEMENT_LOCALNAME === localName) {
        this.log.info('Discovered new %s', uuid)

        // eslint-disable-next-line new-cap
        const accessory = new this.api.platformAccessory<LILOContext>(ADVERTISEMENT_LOCALNAME, uuidAccessory)
        accessory.context.uuid = uuid
        this.configureAccessory(accessory)
        this.api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
        await this.initialize(accessory)
      }
    })
  }

  private stopBluetooth() {
    const { destroy, stopDiscovery } = this
    const lilos = [...this.lilos.values()]
    this.bluetooth = null
    this.destroy = null
    this.stopDiscovery = null
    this.lilos.clear()
    const stopped = Promise.resolve(stopDiscovery ? stopDiscovery() : null)
    const closed = stopped.finally(() => Promise.all(lilos.map((promise) => promise.then((lilo) => lilo.close()))))
    closed.finally(() => {
      if (destroy) destroy()
    })
  }

  private async getLilo(accessory: PlatformAccessory<LILOContext>): Promise<Lilo> {
    const { uuid } = accessory.context
    if (!uuid) throw new Error(`Accessory does not have BLE uuid: ${accessory.UUID}`)
    const awaitLilo = async (): Promise<Lilo> => {
      const adapter = await this.startBluetooth().defaultAdapter()
      const device = await adapter.waitDevice(uuid)
      return new Lilo(async () => device)
    }

    let awaited = this.lilos.get(uuid)
    if (!awaited) {
      awaited = awaitLilo()
      this.lilos.set(uuid, awaited)
    }
    return awaited
  }

  private async initialize(accessory: PlatformAccessory<LILOContext>) {
    const {
      HapStatusError, Service, Characteristic,
    } = this.api.hap

    const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    const onCharacteristic = service.getCharacteristic(Characteristic.On)
    try {
      const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)
      const lilo = await this.getLilo(accessory)
      const manufacturer = await lilo.getManufacturerName()
      const revision = await lilo.getFirmwareRevision()
      information.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      information.setCharacteristic(Characteristic.FirmwareRevision, revision)
      const value = await getOnValue(lilo)
      this.log.info('Got OnValue', value)
      onCharacteristic.updateValue(value)
    } catch (e) {
      this.log.warn('Exception initializing LILO', e)
      onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
    }
  }
}
