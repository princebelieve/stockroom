import { weighingSettings, type WeighingSettings } from '../../server/weighed-goods.mjs'
export function readWeighing(businessId:string):WeighingSettings {try{return weighingSettings(JSON.parse(localStorage.getItem('stockroom-weighing:'+businessId)||'{}'))}catch{return weighingSettings()}}
