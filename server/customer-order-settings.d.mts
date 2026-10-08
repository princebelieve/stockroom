export type CustomerOrderSettings = { retailEnabled: boolean; retailProductIds: string[]; bankName: string; accountName: string; accountNumber: string; transferInstructions: string; deliveryEnabled: boolean; deliveryFee: number; deliveryZones: Array<{id:string;name:string;fee:number}> }
export function customerOrderSettings(value?: unknown): CustomerOrderSettings
export function customerHandoff(settings: unknown, input: any, restaurant?: boolean): any
