import Debugger from '../debug.js'
import promiseWithTimeout from './promiseWithTimeout.js'

const debug = Debugger('CommandQueue')

export default abstract class CommandQueue {
  private count = 0

  private _promise: Promise<unknown> = Promise.resolve() // current running promise

  private _disconnectTimeoutId: NodeJS.Timeout | null = null

  protected _timeout = 1000

  protected abstract start(): Promise<void>

  protected abstract stop(): Promise<void>

  close(): void {
    if (this.count >= 0) {
      this._promise.finally(async () => {
        debug('Closing queue')
        await this.stop()
      })
      this.count = -1
    }
  }

  private async execute<V1>(prev: Promise<unknown>, cmd: () => Promise<V1>): Promise<V1> {
    this.count += 1
    await prev
    if (this.count < 0) {
      throw new Error('queue closed, dropping command')
    }

    try {
      return await promiseWithTimeout(60000, cmd, 'Queue command timed out')
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
            this._promise = this.stop().catch((e) => {
              debug('Exception stopping queue', e)
            })
          }, this._timeout)
        }
      }
    }
  }

  push<V>(command: () => Promise<V>): Promise<V> {
    if (this.count === 0) { // need to start promise chain
      if (this._disconnectTimeoutId === null) {
        debug('Starting queue')
        this._promise = this.execute(this._promise, () => this.start()).catch((e) => {
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
