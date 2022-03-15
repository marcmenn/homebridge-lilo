import { Peripheral } from '@abandonware/noble'
import Debugger from 'debug'
import {
  API, HAPStatus, Logger, PlatformAccessory, PlatformConfig,
} from 'homebridge'
import { DynamicPlatformPlugin } from 'homebridge/lib/api.js'
import getOnValue from './getOnValue.js'
import Lilo from './lilo/Lilo.js'
import setOnValue from './setOnValue.js'

const debug = Debugger('LILO')

export default class LILOPlatform implements DynamicPlatformPlugin {
  private accessories: PlatformAccessory[] = []

  private readonly log: Logger

  private readonly api: API

  constructor(log: Logger, config: PlatformConfig, api: API) {
    const onDiscover = (peripheral: Peripheral) => {
      const { advertisement } = peripheral
      if (Lilo.is(peripheral)) {
        debug('Found', advertisement)
        this.addLILO(peripheral)
      } else {
        debug('Discovered non LILO', advertisement)
      }
    }

    this.log = log
    this.api = api

    api.on('didFinishLaunching', () => {
      const shutdown = Lilo.startDiscovery(onDiscover)
      api.on('shutdown', () => {
        shutdown().catch((e) => {
          log.warn(e)
        })
      })
    })
  }

  private connectAccessory(accessory: PlatformAccessory, lilo: Lilo) {
    const {
      HapStatusError, Service, Characteristic,
    } = this.api.hap
    this.api.on('shutdown', () => lilo.close())

    const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)
    information.setCharacteristic(Characteristic.Model, 'LILO')

    const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    const onCharacteristic = service.getCharacteristic(Characteristic.On)

    onCharacteristic
      .onSet(async (value) => {
        debug('Switching to ', Boolean(value))
        await setOnValue(lilo, Boolean(value))
      })

    const updateGet = async () => {
      debug('Getting OnValue')
      const value = await getOnValue(lilo)
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

  addLILO(peripheral: Peripheral): void {
    const { id, advertisement } = peripheral
    const lilo = new Lilo(peripheral)
    const extractAccessory = (uuid: string): null | PlatformAccessory => {
      const oldAccessory = this.accessories.findIndex((accessory) => accessory.UUID === uuid)
      if (oldAccessory < 0) return null
      const [result] = this.accessories.splice(oldAccessory, 1)
      return result
    }

    const uuidAccessory = this.api.hap.uuid.generate(id)

    const existingAccessory = extractAccessory(uuidAccessory)
    if (existingAccessory) {
      this.log.info('Reconnecting %s', existingAccessory.UUID)
      this.connectAccessory(existingAccessory, lilo)
      return
    }

    this.log.info('Discovered new %s', id)
    const LILOAccessory = this.api.platformAccessory
    const accessory = new LILOAccessory(advertisement.localName, uuidAccessory)
    this.accessories.push(accessory)
    this.connectAccessory(accessory, lilo)
    this.api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Loading %s', accessory.UUID)
    this.accessories.push(accessory)
  }
}
