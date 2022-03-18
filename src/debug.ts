import Debugger from 'debug'

const root = Debugger('LILO')
const logger = [root]
let { log } = root

export default (namespace?: string): Debugger.Debugger => {
  if (namespace) {
    const result = root.extend(namespace)
    logger.push(result)
    result.log = log
    return result
  }
  return root
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setLog = (logFn: (...args: any[]) => any) => {
  log = logFn
  logger.forEach((l) => {
    // eslint-disable-next-line no-param-reassign
    l.log = logFn
  })
}
