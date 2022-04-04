import { Adapter } from 'node-ble'
import { clearTimeout } from 'timers'
import Debugger from '../debug.js'

const debug = Debugger('discover')

const startDiscovery = (adapter: Adapter, onDiscover: (uuid: string, adapter: Adapter) => Promise<void>): () => Promise<void> => {
  const knownUuids = new Set<string>()
  let stop = false
  let activePromise = Promise.resolve()
  let activeTimeout: NodeJS.Timeout | null = null

  const runOnDiscover = async (uuid: string): Promise<void> => {
    if (knownUuids.has(uuid) || !adapter) return

    knownUuids.add(uuid)
    await onDiscover(uuid, adapter)
  }

  const discoverer = async () => {
    if (!await adapter.isDiscovering()) await adapter.startDiscovery()
    const uuids = await adapter.devices()
    await Promise.all(uuids.map(runOnDiscover))
  }

  const timeout = () => {
    activeTimeout = null
    if (stop) {
      debug('stop scanning')
      return
    }
    activePromise = discoverer().then(() => {
      if (!stop) {
        activeTimeout = setTimeout(timeout, 1000)
      }
    }).catch((e) => {
      debug('Error discovering', e)
    })
  }

  timeout()

  return async () => {
    stop = true
    if (activeTimeout) clearTimeout(activeTimeout)
    return activePromise.finally()
  }
}

export default startDiscovery
