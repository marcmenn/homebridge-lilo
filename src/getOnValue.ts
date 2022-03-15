import Lilo from './lilo/Lilo.js'

export default async (lilo: Lilo): Promise<boolean> => {
  const intensity = await lilo.getIntensity()
  if (intensity === 0) return false
  const time = await lilo.getTime()
  if (!time) return false
  const schedule = await lilo.getSchedule()
  if (!schedule) return false
  const on = schedule[0] * 60 + schedule[1]
  const off = schedule[2] * 60 + schedule[3]
  const now = time[0] * 60 + time[1]
  return on <= now && now <= off
}
