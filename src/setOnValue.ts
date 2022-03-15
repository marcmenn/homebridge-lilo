import Lilo, {
  INTENSITY_OFF, INTENSITY_SCHEDULED, Schedule, Time,
} from './lilo/Lilo.js'

const ON: Schedule = [0, 0, 23, 59]

const updateClock = async (lilo: Lilo): Promise<void> => {
  const now = new Date()
  const newTime: Time = [now.getHours(), now.getMinutes()]
  const time = await lilo.getTime()
  if (!time || time.join(':') !== newTime.join(':')) {
    await lilo.setTime(newTime)
  }
}

const setOn = async (lilo: Lilo): Promise<void> => {
  const intensity = await lilo.getIntensity()
  const schedule = await lilo.getSchedule()
  if (intensity && schedule && schedule.join(':') === ON.join(':')) {
    return
  }
  await updateClock(lilo)
  if (!schedule || schedule.join(':') !== ON.join(':')) {
    await lilo.setSchedule(ON)
  }
  if (!intensity) {
    await lilo.setIntensity(INTENSITY_SCHEDULED)
  }
}

const setOff = async (lilo: Lilo): Promise<void> => {
  const intensity = await lilo.getIntensity()
  if (!intensity) return
  await lilo.setIntensity(INTENSITY_OFF)
  await updateClock(lilo)
}

const setOnValue = async (lilo: Lilo, value: boolean): Promise<void> => {
  if (value) {
    await setOn(lilo)
  } else {
    await setOff(lilo)
  }
}

export default setOnValue
