import Debugger from 'debug'
import { API, HAPStatus, PlatformAccessory } from 'homebridge'
import getOnValue from './getOnValue.js'
import Lilo from './lilo/Lilo.js'
import setOnValue from './setOnValue.js'

const debug = Debugger('LILO')

export default (api: API, accessory: PlatformAccessory, lilo: Lilo): void => {
  const {
    HapStatusError, Service, Characteristic,
  } = api.hap
  api.on('shutdown', () => lilo.close())

  const information = accessory.getService(Service.AccessoryInformation) || accessory.addService(Service.AccessoryInformation)
  information.setCharacteristic(Characteristic.Model, 'LILO')
  Promise.all([lilo.getManufacturerName(), lilo.getFirmwareRevision()])
    .then(([manufacturer, revision]) => {
      information.setCharacteristic(Characteristic.Manufacturer, manufacturer)
      information.setCharacteristic(Characteristic.FirmwareRevision, revision)
    }).catch((e) => {
      debug('Failed to update base information', e)
    })

  const service = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
  const onCharacteristic = service.getCharacteristic(Characteristic.On)

  onCharacteristic.onSet((value) => {
    debug('Switching to ', Boolean(value))
    setOnValue(lilo, Boolean(value)).catch((e) => {
      debug('Exception setting OnValue', e)
      onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
    })
  })

  getOnValue(lilo).then((value) => {
    debug('Got OnValue', value)
    onCharacteristic.updateValue(value)
  }).catch((e) => {
    debug('Exception getting OnValue', e)
    onCharacteristic.updateValue(new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE))
  })
}
