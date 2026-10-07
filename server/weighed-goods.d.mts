export type WeighingSettings={keyboard:boolean;labels:boolean;unit:'kg'|'g';prefix:string;codes:Array<{code:string;productId:string}>}
export function kilogramUnit(unit:unknown):boolean
export function measuredKilograms(raw:unknown,unit?:string):number
export function weighingSettings(input?:any):WeighingSettings
export function weightLabel(raw:unknown,settings:any,products:any[]):{product:any;quantity:number;barcode:string}|null
