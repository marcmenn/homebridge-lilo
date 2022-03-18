import Debugger from 'debug'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogFunction = (...args: any[]) => any

const root = Debugger('LILO')
const logger = [root]
let log: LogFunction | null = null

export default (namespace?: string): Debugger.Debugger => {
  if (namespace) {
    root('Creating logger for namespace %s', namespace)
    const result = root.extend(namespace)
    logger.push(result)
    if (log) result.log = log
    return result
  }
  return root
}

export const setLog = (logFn: LogFunction) => {
  root('Redirecting log output for %d existing loggers', logger.length)
  log = logFn
  logger.forEach((l) => {
    // eslint-disable-next-line no-param-reassign
    l.log = logFn
  })
}
