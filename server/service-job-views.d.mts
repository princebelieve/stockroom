export function overdueJob(job:any,today:string):boolean
export function filterServiceJobs(jobs:any[],options:{query?:string;status?:string;today:string}):any[]
export function invoiceStatements(jobs:any[]):Array<{key:string;customerName:string;customerPhone:string;currency:string;businessName:string;jobs:any[];total:number;netPaid:number;due:number}>
