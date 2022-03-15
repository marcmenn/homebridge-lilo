import { Peripheral } from '@abandonware/noble'
import { API, Logger, PlatformAccessory } from 'homebridge'
import connectAccessory from './connect.js'
import BasePeripheral from './lilo/BasePeripheral.js'
import Lilo from './lilo/Lilo.js'

export default (log: Logger, api: API, existing: PlatformAccessory[]): () => Promise<void> => BasePeripheral.startDiscovery((peripheral: Peripheral) => {
  if (Lilo.is(peripheral)) {
    const { id, advertisement } = peripheral
    log.debug('Found', advertisement)

    const lilo = new Lilo(peripheral)

    const uuidAccessory = api.hap.uuid.generate(id)
    const oldAccessoryIndex = existing.findIndex((accessory) => accessory.UUID === uuidAccessory)
    if (oldAccessoryIndex >= 0) {
      log.info('Reconnecting %s', id)
      const [existingAccessory] = existing.splice(oldAccessoryIndex, 1)
      connectAccessory(api, existingAccessory, lilo)
      return
    }

    log.info('Discovered new %s', id)
    const LILOAccessory = api.platformAccessory
    const accessory = new LILOAccessory(advertisement.localName, uuidAccessory)
    connectAccessory(api, accessory, lilo)
    api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
  }
})
