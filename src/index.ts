import type { API } from 'homebridge'
import LILOPlatform from './LILOPlatform.js'

export default (api: API): void => {
  api.registerPlatform('homebridge-lilo', 'LILO', LILOPlatform)
}
