export function birthdayValue(value:unknown):string
export function birthdayCustomers<T extends {birthday?:string;birthdayReminders?:boolean|number}>(customers:T[],now?:Date,timeZone?:string):T[]
