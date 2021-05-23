import Lilo, {INTENSITY_OFF, INTENSITY_SCHEDULED, Schedule, Time} from "./lilo";

const ON: Schedule = [0, 0, 23, 59]

export default class LiloSwitch extends Lilo {
  async getOnValue(): Promise<boolean | null> {
    const intensity = await this.getIntensity()
    if (intensity === 0) return false
    const time = await this.getTime()
    if (!time) return null
    const schedule = await this.getSchedule()
    if (!schedule) return null
    const on = schedule[0] * 60 + schedule[1]
    const off = schedule[2] * 60 + schedule[3]
    const now = time[0] * 60 + time[1]
    return on <= now && now <= off
  }

  async updateClock(): Promise<void> {
    const now = new Date()
    const newTime:Time = [now.getHours(), now.getMinutes()]
    const time = await this.getTime()
    if (!time || time.join(':') !== newTime.join(':')) {
      await this.setTime(newTime)
    }
  }

  async setOff(): Promise<void> {
    const intensity = await this.getIntensity()
    if (!intensity) return
    await this.setIntensity(INTENSITY_OFF)
    await this.updateClock()
  }

  async setOn(): Promise<void> {
    const intensity = await this.getIntensity()
    const schedule = await this.getSchedule()
    if (intensity && schedule && schedule.join(':') === ON.join(':')) {
      return
    }
    await this.updateClock()
    if (!schedule || schedule.join(':') !== ON.join(':')) {
      await this.setSchedule(ON)
    }
    if (!intensity) {
      await this.setIntensity(INTENSITY_SCHEDULED)
    }
  }

  async setOnValue(value: boolean): Promise<void> {
    if (value) {
      await this.setOn()
    } else {
      await this.setOff()
    }
  }
}
