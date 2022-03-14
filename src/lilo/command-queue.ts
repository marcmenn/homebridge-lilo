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

  close(): void {
    if (this.count >= 0) {
      this._promise.finally(async () => {
        debug('Closing queue')
        await this._onStop()
      })
      this.count = -1
    }
  }

  private async execute<V1>(prev: Promise<unknown>, cmd: Command<V1>): Promise<V1> {
    this.count += 1
    await prev
    if (this.count < 0) {
      throw new Error('queue closed, dropping command')
    }

    try {
      return await cmd()
    } catch (e) {
      debug('Exception executing command', e)
      throw e
    } finally {
      if (this.count > 0) {
        this.count -= 1
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
    }
  }

  push<V>(command: Command<V>): Promise<V> {
    if (this.count === 0) { // need to start promise chain
      if (this._disconnectTimeoutId === null) {
        debug('Starting queue')
        this._promise = this.execute(this._promise, this._onStart).catch((e) => {
          debug('Exception starting queue', e)
          throw e
        })
      } else { // cancel timeout, direct execute command
        debug('Cancelling queue shutdown')
        clearTimeout(this._disconnectTimeoutId)
        this._disconnectTimeoutId = null
      }
    }
    const r = this.execute(this._promise, command)
    this._promise = r
    return r
  }
}
