import { Adapter } from 'node-ble'
import Debugger from '../debug.js'

const debug = Debugger('discover')

const startDiscovery = (adapter: Adapter, onDiscover: (uuid: string) => Promise<void>): () => void => {
  const knownUuids = new Set<string>()
  let stop = false

  const runOnDiscover = async (uuid: string): Promise<void> => {
    if (knownUuids.has(uuid) || !adapter) return

    knownUuids.add(uuid)
    await onDiscover(uuid)
  }

  const discoverer = async () => {
    if (!await adapter.isDiscovering()) await adapter.startDiscovery()
    const uuids = await adapter.devices()
    await Promise.all(uuids.map(runOnDiscover))
  }

  const timeout = () => {
    if (stop) {
      debug('stop scanning')
      return
    }
    discoverer().then(() => {
      setTimeout(timeout, 1000)
    }).catch((e) => {
      debug('Error discovering', e)
    })
  }

  timeout()

  return () => {
    stop = true
  }
}

export default startDiscovery
