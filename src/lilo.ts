import { Characteristic, Peripheral } from '@abandonware/noble'
import BasePeripheral from './base-peripheral.js'

export const INTENSITY_INITIAL = -2
export const INTENSITY_OFF = 0
export const INTENSITY_SCHEDULED = 3

const CLOCK_INITIAL = Buffer.of(0x94)
const SCHEDULE_EMPTY = Buffer.of(0)

// const SERVICE_CLOCK = '53e12188b8404b2193ce081726ddc739'
const CHARACTERISTIC_CLOCK = '53e12189b8404b2193ce081726ddc739'

// const SERVICE_SETTINGS = '53e11631b8404b2193ce081726ddc739'
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
    return this.withConnectedCharacteristic(CHARACTERISTIC_INTENSITY, async (intensity: Characteristic) => {
      if (!intensity) return undefined
      const b = await intensity.readAsync()
      if (b.length !== 1) {
        this.log.warn('Read illegal intensity from LILO', b)
        return null
      }
      return b.readInt8()
    })
  }

  async setIntensity(intensity: number): Promise<void> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_INTENSITY, async (characteristic: Characteristic) => {
      const b = Buffer.alloc(1)
      b.writeInt8(intensity)
      await characteristic.writeAsync(b, true)
      this.log.debug(`Set intensity to ${intensity}`)
    })
  }

  async getSchedule(): Promise<Schedule | null | undefined> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_SCHEDULE, async (schedule: Characteristic) => {
      if (!schedule) return undefined
      const b = await schedule.readAsync()
      if (Buffer.compare(SCHEDULE_EMPTY, b) === 0) return null
      if (b.length !== 4) {
        this.log.warn('Read illegal schedule from LILO', b)
        return null
      }
      return [b[0], b[1], b[2], b[3]]
    })
  }

  async setSchedule(newSchedule: Schedule | null): Promise<void> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_SCHEDULE, async (schedule: Characteristic) => {
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
      this.log.debug(`Set schedule to ${formatSchedule(newSchedule)}`)
    })
  }

  async getTime(): Promise<Time | null | undefined> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_CLOCK, async (clock: Characteristic) => {
      if (!clock) return undefined
      const b = await clock.readAsync()
      if (Buffer.compare(CLOCK_INITIAL, b) === 0) return null
      if (b.length !== 2) {
        this.log.warn('Read illegal clock from LILO', b)
        return null
      }
      return [b[0], b[1]]
    })
  }

  async setTime(time: Time): Promise<void> {
    return this.withConnectedCharacteristic(CHARACTERISTIC_CLOCK, async (clock: Characteristic) => {
      if (!clock) throw new Error('No characteristic for clock found')
      const b = Buffer.alloc(2)
      b.writeUInt8(time[0], 0)
      b.writeUInt8(time[1], 1)
      await clock.writeAsync(b, true)
      this.log.debug(`Set clock to ${formatTime(time)}`)
    })
  }
}
