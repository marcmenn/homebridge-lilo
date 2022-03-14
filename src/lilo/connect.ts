import { Peripheral } from '@abandonware/noble'
import { LiloLogger } from './lilo-logger.js'

const CONNECT_TIMEOUT = 90 * 1000

const connect = (_peripheral: Peripheral, id: string, log: LiloLogger): Promise<void> => {
  let timeout: NodeJS.Timeout | null = null
  switch (_peripheral.state) {
    case 'disconnected':
      log.info('connecting to %s', id)
      return new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          timeout = null
          reject(new Error(`Timeout connecting to ${id}`))
          log.warn('Timeout connecting to %s', id)
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
      log.warn('Peripheral is in error state %s', id)
      throw new Error('Peripheral is in error state')
    case 'connecting':
      log.info('waiting for connection to %s', id)
      return new Promise((resolve) => {
        _peripheral.once('connect', () => {
          resolve()
        })
      })
    case 'connected':
      log.info('already connected to %s', id)
      return Promise.resolve()
    case 'disconnecting':
      log.info('waiting for disconnect to finish before reconnecting to %s', id)
      return new Promise((resolve) => {
        _peripheral.once('disconnect', () => {
          resolve(connect(_peripheral, id, log))
        })
      })
    default:
      log.warn('unknown state of %s: %s', id, _peripheral.state)
      throw new Error(`Unknown peripheral state: ${_peripheral.state}`)
  }
}

export default connect
