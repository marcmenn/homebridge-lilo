import { Peripheral } from '@abandonware/noble'
import Debugger from '../debug.js'
import BasePeripheral from './BasePeripheral.js'

const debug = Debugger('Lilo')

export const INTENSITY_INITIAL = -2
export const INTENSITY_OFF = 0
export const INTENSITY_SCHEDULED = 3

const CLOCK_INITIAL = Buffer.of(0x94)
const SCHEDULE_EMPTY = Buffer.of(0)

const SERVICE_CLOCK = '53e12188b8404b2193ce081726ddc739'
const CHARACTERISTIC_CLOCK = '53e12189b8404b2193ce081726ddc739'

const SERVICE_SETTINGS = '53e11631b8404b2193ce081726ddc739'
const CHARACTERISTIC_SCHEDULE = '53e11633b8404b2193ce081726ddc739'
const CHARACTERISTIC_INTENSITY = '53e11632b8404b2193ce081726ddc739'

export type Time = [number, number]
export type Schedule = [number, number, number, number]

export const formatSchedule = (schedule: Schedule | unknown): string => {
  if (!Array.isArray(schedule)) return 'N/A'
  const [h0, m0, h1, m1] = schedule.map((v) => (v < 10 ? `0${v}` : `${v}`))
  return `${h0}:${m0} - ${h1}:${m1}`
}

export const formatTime = (time: Time | unknown): string => {
  if (!Array.isArray(time)) return 'N/A'
  const [h, m] = time.map((v) => (v < 10 ? `0${v}` : `${v}`))
  return `${h}:${m}`
}

const ADVERTISEMENT_LOCALNAME = 'LILO'

export default class Lilo extends BasePeripheral {
  static is(peripheral: Peripheral): boolean {
    return peripheral.advertisement.localName === ADVERTISEMENT_LOCALNAME
  }

  async getIntensity(): Promise<number | null | undefined> {
    debug('Getting intensity')
    return this.withCharacteristic(SERVICE_SETTINGS, CHARACTERISTIC_INTENSITY, async (intensity) => {
      debug('Reading intensity')
      const b = await intensity.readAsync()
      if (b.length !== 1) {
        debug('Read illegal intensity from LILO', b)
        return null
      }
      const value = b.readInt8()
      debug('Read intensity: %d', value)
      return value
    })
  }

  async setIntensity(intensity: number): Promise<void> {
    debug(`Setting intensity to ${intensity}`)
    await this.withCharacteristic(SERVICE_SETTINGS, CHARACTERISTIC_INTENSITY, async (characteristic) => {
      const b = Buffer.alloc(1)
      b.writeInt8(intensity)
      await characteristic.writeAsync(b, true)
      debug(`Set intensity to ${intensity}`)
    })
  }

  async getSchedule(): Promise<Schedule | null | undefined> {
    debug('Getting schedule')
    return this.withCharacteristic(SERVICE_SETTINGS, CHARACTERISTIC_SCHEDULE, async (schedule) => {
      const b = await schedule.readAsync()
      if (Buffer.compare(SCHEDULE_EMPTY, b) === 0) return null
      if (b.length !== 4) {
        debug('Read illegal schedule from LILO', b)
        return null
      }
      return [b[0], b[1], b[2], b[3]]
    })
  }

  async setSchedule(newSchedule: Schedule | null): Promise<void> {
    debug(`Setting schedule to ${formatSchedule(newSchedule)}`)
    await this.withCharacteristic(SERVICE_SETTINGS, CHARACTERISTIC_SCHEDULE, async (schedule) => {
      if (newSchedule) {
        const b = Buffer.alloc(4)
        b.writeUInt8(newSchedule[0], 0)
        b.writeUInt8(newSchedule[1], 1)
        b.writeUInt8(newSchedule[2], 2)
        b.writeUInt8(newSchedule[3], 3)
        await schedule.writeAsync(b, true)
      } else {
        await schedule.writeAsync(SCHEDULE_EMPTY, true)
      }
      debug(`Set schedule to ${formatSchedule(newSchedule)}`)
    })
  }

  async getTime(): Promise<Time | null | undefined> {
    debug('Getting clock time')
    return this.withCharacteristic(SERVICE_CLOCK, CHARACTERISTIC_CLOCK, async (clock) => {
      const b = await clock.readAsync()
      if (Buffer.compare(CLOCK_INITIAL, b) === 0) return null
      if (b.length !== 2) {
        debug('Read illegal clock from LILO', b)
        return null
      }
      const result: Time = [b[0], b[1]]
      debug(`Received clock time: ${formatTime(result)}`)
      return result
    })
  }

  async setTime(time: Time): Promise<void> {
    debug(`Setting clock to ${formatTime(time)}`)
    await this.withCharacteristic(SERVICE_CLOCK, CHARACTERISTIC_CLOCK, async (clock) => {
      const b = Buffer.alloc(2)
      b.writeUInt8(time[0], 0)
      b.writeUInt8(time[1], 1)
      await clock.writeAsync(b, true)
      debug(`Set clock to ${formatTime(time)}`)
    })
  }
}
