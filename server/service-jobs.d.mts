export function serviceJobBalance(job: any, returns?: any[]): {paid:number;refunded:number;netPaid:number;due:number}
export function validateServiceJob(job:any,previous?:any,snapshot?:boolean,refunds?:any[]):any
export function validateServiceJobPayment(sale:any):any
export function applyServiceJob(db:any,scope:string,job:any,organizationId?:string):Promise<void>
export function requiresServiceJobSync(operation:any):boolean
export function handleServiceJobs(options:any):Promise<any>
