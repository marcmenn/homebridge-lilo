import { Peripheral } from '@abandonware/noble'
import Debugger from 'debug'

const debug = Debugger('LILO.CONNECT')

const CONNECT_TIMEOUT = 90 * 1000

const connect = (_peripheral: Peripheral, id: string): Promise<void> => {
  let timeout: NodeJS.Timeout | null = null
  switch (_peripheral.state) {
    case 'disconnected':
      debug('connecting to %s', id)
      return new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          timeout = null
          reject(new Error(`Timeout connecting to ${id}`))
          debug('Timeout connecting to %s', id)
          _peripheral.cancelConnect()
        }, CONNECT_TIMEOUT)
        _peripheral.connect((error) => {
          if (timeout) {
            clearTimeout(timeout)
            if (error) reject(error)
            resolve()
          }
        })
      })
    case 'error':
      debug('Peripheral is in error state %s', id)
      throw new Error('Peripheral is in error state')
    case 'connecting':
      debug('waiting for connection to %s', id)
      return new Promise((resolve) => {
        _peripheral.once('connect', () => {
          resolve()
        })
      })
    case 'connected':
      debug('already connected to %s', id)
      return Promise.resolve()
    case 'disconnecting':
      debug('waiting for disconnect to finish before reconnecting to %s', id)
      return new Promise((resolve) => {
        _peripheral.once('disconnect', () => {
          resolve(connect(_peripheral, id))
        })
      })
    default:
      debug('unknown state of %s: %s', id, _peripheral.state)
      throw new Error(`Unknown peripheral state: ${_peripheral.state}`)
  }
}

export default connect
