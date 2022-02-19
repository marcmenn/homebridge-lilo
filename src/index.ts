import Debugger from 'debug'
import type { API, PlatformAccessory, PlatformConfig } from 'homebridge'
import { HAPStatus, Logger } from 'homebridge'
import { DynamicPlatformPlugin } from 'homebridge/lib/api'
import bleAdapterFactory, { BLEAdapter } from './noble-adapter.js'
import LiloSwitch from './lilo-switch.js'

const debug = Debugger('LILO')

class LILOPlatform implements DynamicPlatformPlugin {
  private accessories: PlatformAccessory[] = []

  private readonly log: Logger

  private readonly api: API

  private readonly bleAdapter: BLEAdapter

  constructor(log: Logger, config: PlatformConfig, api: API) {
    this.log = log
    this.api = api
    this.bleAdapter = bleAdapterFactory((lilo) => this.addLILO(lilo))

    api.on('didFinishLaunching', () => {
      this.bleAdapter.init()
      api.on('shutdown', () => {
        this.bleAdapter.shutdown().catch((e) => {
          log.warn(e)
        })
      })
    })
  }

  private connectAccessory(accessory: PlatformAccessory, lilo: LiloSwitch) {
    const {
      HapStatusError, Service, Characteristic,
    } = this.api.hap
    this.api.on('shutdown', () => lilo.disconnect())

    const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)
    information.setCharacteristic(Characteristic.Model, 'LILO')

    const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    const onCharacteristic = service.getCharacteristic(Characteristic.On)

    onCharacteristic
      .onSet(async (value) => {
        debug('Switching to ', Boolean(value))
        await lilo.setOnValue(Boolean(value))
      })

    const updateGet = async () => {
      debug('Getting OnValue')
      const value = await lilo.getOnValue()
      debug('Got value', value)
      onCharacteristic.updateValue(value)
      const manufacturer = await lilo.getManufacturerName()
      if (manufacturer) {
        debug('Found manufacturer', manufacturer)
        information.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      }
      const revision = await lilo.getFirmwareRevision()
      if (revision) {
        debug('Found revision', revision)
        information.setCharacteristic(Characteristic.FirmwareRevision, revision)
      }
    }

    updateGet().catch((e) => {
      debug('Exception getting OnValue', e)
      onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
    })
  }

  addLILO(lilo: LiloSwitch): void {
    lilo.setLogger(this.log)

    const extractAccessory = (id:string):null | PlatformAccessory => {
      const oldAccessory = this.accessories.findIndex((accessory) => accessory.UUID === id)
      if (oldAccessory < 0) return null
      const [result] = this.accessories.splice(oldAccessory, 1)
      return result
    }

    const uuidAccessory = this.api.hap.uuid.generate(lilo.id)

    const existingAccessory = extractAccessory(uuidAccessory)
    if (existingAccessory) {
      this.log.info('Reconnecting %s', existingAccessory.UUID)
      this.connectAccessory(existingAccessory, lilo)
      return
    }

    this.log.info('Discovered new %s', lilo.id)
    const PlatformAccessory = this.api.platformAccessory
    const accessory = new PlatformAccessory(lilo.localName, uuidAccessory)
    this.accessories.push(accessory)
    this.connectAccessory(accessory, lilo)
    this.api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading %s', accessory.UUID)
    this.accessories.push(accessory)
  }
}

export default (api: API): void => {
  api.registerPlatform('homebridge-lilo', 'LILO', LILOPlatform)
}
