export type OilPricing={bulk:Array<{minimum:number;price:number}>;customers:Array<{customerId:string;price:number}>}
export function oilPricing(value?:any):OilPricing
export function oilPrice(product:any,rules:any,baseQuantity:number,customerId?:string):{price:number;label:string}
