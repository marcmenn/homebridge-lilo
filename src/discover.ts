import { API, Logger, PlatformAccessory } from 'homebridge'
import { Device } from 'node-ble'
import connectAccessory from './connect.js'
import BasePeripheral from './lilo/BasePeripheral.js'
import Lilo, { ADVERTISEMENT_LOCALNAME } from './lilo/Lilo.js'

export default (log: Logger, api: API, existing: PlatformAccessory[]): () => void => {
  const onDiscover = async (uuid: string, device: Device) => {
    try {
      const localName = await device.getName()
      if (ADVERTISEMENT_LOCALNAME !== localName) return
    } catch (e) {
      return
    }
    log.debug('Found', uuid)

    const lilo = new Lilo(uuid)

    const uuidAccessory = api.hap.uuid.generate(uuid)
    const oldAccessoryIndex = existing.findIndex((accessory) => accessory.UUID === uuidAccessory)
    if (oldAccessoryIndex >= 0) {
      log.info('Reconnecting %s', uuid)
      const [existingAccessory] = existing.splice(oldAccessoryIndex, 1)
      connectAccessory(api, existingAccessory, lilo)
      return
    }

    log.info('Discovered new %s', uuid)
    const LILOAccessory = api.platformAccessory
    const accessory = new LILOAccessory(ADVERTISEMENT_LOCALNAME, uuidAccessory)
    connectAccessory(api, accessory, lilo)
    api.registerPlatformAccessories('homebridge-lilo', 'LILO', [accessory])
  }
  return BasePeripheral.startDiscovery(onDiscover)
}
