import Debugger from 'debug'

const debug = Debugger('LILO.QUEUE')

type Command<V> = () => Promise<V>

export default class CommandQueue {
  private count = 0

  private _promise: Promise<unknown> = Promise.resolve() // current running promise

  private _disconnectTimeoutId: NodeJS.Timeout | null = null

  private _timeout: number

  private _onStart: () => Promise<void>

  private _onStop: () => Promise<void>

  constructor(timeout: number, onStart: () => Promise<void>, onStop: () => Promise<void>) {
    this._timeout = timeout
    this._onStart = onStart
    this._onStop = onStop
  }

  push<V>(command: Command<V>): Promise<V> {
    const prepareDisconnect = () => {
      if (this.count === 0) {
        debug('Scheduling queue shutdown')
        this._disconnectTimeoutId = setTimeout(() => {
          this._disconnectTimeoutId = null
          this._promise = this._onStop().catch((e) => {
            debug('Exception stopping queue', e)
          })
        }, this._timeout)
      }
    }

    const execute = <V1>(cmd: Command<V1>): Promise<V1> => {
      this.count += 1
      const result = this._promise
        .then(cmd)
        .catch((e) => {
          debug('Exception executing command', e)
          throw e
        })
        .finally(() => {
          this.count -= 1
          prepareDisconnect()
        })
      this._promise = result
      return result
    }

    if (this.count === 0) { // need to start promise chain
      if (this._disconnectTimeoutId === null) {
        debug('Starting queue')
        execute(this._onStart).catch((e) => {
          debug('Exception starting queue', e)
          throw e
        })
      } else { // cancel timeout, direct execute command
        debug('Cancelling queue shutdown')
        clearTimeout(this._disconnectTimeoutId)
        this._disconnectTimeoutId = null
      }
    }
    return execute(command)
  }
}
