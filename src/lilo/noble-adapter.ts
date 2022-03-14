import noble, { Peripheral } from '@abandonware/noble'
import Debugger from 'debug'

const debug = Debugger('LILO')

export type BLEAdapter = {
  init(): void,
  shutdown(): Promise<void>,
}

export default (onDiscover: (peripheral: Peripheral) => void): BLEAdapter => {
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
