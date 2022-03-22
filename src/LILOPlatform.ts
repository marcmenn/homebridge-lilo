import { createBluetooth } from 'node-ble'
import {
  API, Logger, PlatformAccessory, PlatformConfig,
} from 'homebridge'
import { DynamicPlatformPlugin } from 'homebridge/lib/api.js'
import { setLog } from './debug.js'
import discover from './discover.js'

export default class LILOPlatform implements DynamicPlatformPlugin {
  private accessories: PlatformAccessory[] = []

  constructor(log: Logger, config: PlatformConfig, api: API) {
    setLog(log.info.bind(log))
    api.on('didFinishLaunching', () => {
      const { bluetooth, destroy } = createBluetooth()
      const shutdown = bluetooth.defaultAdapter().then((adapter) => discover(adapter, log, api, this.accessories))
      api.on('shutdown', () => {
        shutdown.then((callback) => callback()).finally(() => {
          destroy()
        })
      })
    })
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory)
  }
}
