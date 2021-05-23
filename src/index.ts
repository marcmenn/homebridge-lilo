import type {API, PlatformAccessory, PlatformConfig} from 'homebridge'
import {HAPStatus, Logger} from "homebridge"
import LiloSwitch from "./lilo-switch"
import {DynamicPlatformPlugin} from "homebridge/lib/api"
import noble,{Peripheral} from "@abandonware/noble"
import Lilo from "./lilo"
import Timeout = NodeJS.Timeout;

const SCAN_DURATION = 5 * 60000

export default (api: API): void => {
  const { uuid, HapStatusError, Service, Characteristic } = api.hap

  const connectAccessory = (accessory: PlatformAccessory, lilo: LiloSwitch) => {
    api.on('shutdown', () => lilo.disconnect())

    const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)
    information.setCharacteristic(Characteristic.Model, 'LILO')

    const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    const onCharacteristic = service.getCharacteristic(Characteristic.On)

    onCharacteristic
      .onSet(async (value) => {
        await lilo.setOnValue(Boolean(value))
      })

    const updateGet = async () => {
      const value = await lilo.getOnValue()
      onCharacteristic.updateValue(value)
      const manufacturer = await lilo.getManufacturerName();
      if (manufacturer) {
        information.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      }
      const revision = await lilo.getFirmwareRevision();
      if (revision) {
        information.setCharacteristic(Characteristic.FirmwareRevision, revision)
      }
    }

    updateGet().catch(() => {
      onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
    })
  }

  class LILOPlatform implements DynamicPlatformPlugin {
    private accessories: PlatformAccessory[] = []
    private readonly log: Logger
    private nobleScanPending = true
    private nobleScanning: null | Timeout = null

    constructor(log: Logger, config: PlatformConfig, api: API) {
      this.log = log

      api.on('didFinishLaunching', () => {
        noble.on('stateChange', (state: string) => this.nobleStateChange(state))
        noble.on('discover', (peripheral: Peripheral) => this.nobleDiscover(peripheral))
        if (noble.state === 'unknown') {
          this.log.warn('BLE is in unknown state')
        } else {
          this.nobleStateChange(noble.state)
        }
        api.on('shutdown', () => {
          this.nobleStopScan()
        })
      })
    }

    private nobleStateChange(state: string) {
      this.log.info('BLE state change to %s', state)
      if (state === 'poweredOn' && this.nobleScanPending) {
        this.log.info('Initiating scan')
        this.nobleScanPending = false
        this.nobleScanning = setTimeout(() => {
          this.nobleStopScan()
        }, SCAN_DURATION)
        noble.startScanning([], false, (error) => {
          if (error) {
            if (this.nobleScanning) {
              clearTimeout(this.nobleScanning)
              this.nobleScanning = null
            }
            this.log.warn('Error initiating scan: %s', error)
          }
        })
      }
    }

    private nobleStopScan() {
      if (this.nobleScanning) {
        this.log.info('stop scanning')
        clearTimeout(this.nobleScanning)
        this.nobleScanning = null
        noble.stopScanning()
      }
    }

    private nobleDiscover(peripheral: Peripheral) {
      if (Lilo.is(peripheral)) {
        this.log.info('Found', peripheral.advertisement)
        this.addLILO(new LiloSwitch(peripheral))
      }
    }

    addLILO(lilo: LiloSwitch): void {
      lilo.setLogger(this.log)

      const extractAccessory = (id:string):null|PlatformAccessory => {
        const oldAccessory = this.accessories.findIndex((accessory) => accessory.UUID === id)
        if (oldAccessory < 0) return null
        const [result] = this.accessories.splice(oldAccessory, 1)
        return result
      }

      const uuidAccessory = uuid.generate(lilo.id);

      const existingAccessory = extractAccessory(uuidAccessory)
      if (existingAccessory) {
        this.log.info('Reconnecting %s', existingAccessory.UUID)
        connectAccessory(existingAccessory, lilo)
        return
      }

      this.log.info('Discovered new %s', lilo.id)
      const accessory = new api.platformAccessory(lilo.localName, uuidAccessory)
      this.accessories.push(accessory)
      connectAccessory(accessory, lilo)
      api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
    }

    configureAccessory(accessory: PlatformAccessory) {
      this.log.debug('Loading %s', accessory.UUID)
      this.accessories.push(accessory);
    }
  }

  api.registerPlatform('homebridge-lilo', 'LILO', LILOPlatform)
}
