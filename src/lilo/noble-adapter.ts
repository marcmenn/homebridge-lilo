import noble, { Peripheral } from '@abandonware/noble'
import Debugger from 'debug'
import LiloSwitch from './lilo-switch.js'
import Lilo from './lilo.js'

const debug = Debugger('LILO')

export type BLEAdapter = {
  init(): void,
  shutdown(): Promise<void>,
}

export default (addLILO: (lilo: LiloSwitch) => void): BLEAdapter => {
  const onStateChange = (state: string) => {
    debug('BLE state change to %s', state)
    if (state === 'poweredOn') {
      debug('Initiating scan')
      noble.startScanning([], false, (error) => {
        if (error) {
          debug('Error initiating scan: %s', error)
        }
      })
    }
  }

  const onDiscover = (peripheral: Peripheral) => {
    if (Lilo.is(peripheral)) {
      debug('Found', peripheral.advertisement)
      addLILO(new LiloSwitch(peripheral))
    } else {
      debug('Discovered non LILO', peripheral.advertisement)
    }
  }

  return {
    init(): void {
      noble.on('discover', onDiscover)
      noble.on('stateChange', onStateChange)
      onStateChange(noble.state)
    },

    async shutdown(): Promise<void> {
      debug('stop scanning')
      noble.removeListener('stateChange', onStateChange)
      noble.removeListener('discover', onDiscover)
      await noble.stopScanningAsync()
    },
  }
}
