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
      const shutdown = discover(log, api, this.accessories)
      api.on('shutdown', () => {
        shutdown()
      })
    })
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory)
  }
}
