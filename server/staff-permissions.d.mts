export const staffCapabilities: Record<string,string>;
export function parsePermissions(value:unknown):Record<string,boolean>|null;
export function effectivePermissions(user:any):Record<string,boolean>;
export function hasPermission(user:any,key:string):boolean;
export function screenPermission(screen:string):string|undefined;
export function routePermission(path:string,method?:string,input?:any):string|null;
export function canRequest(user:any,path:string,method?:string,input?:any):boolean;
export function operationPermission(operation:any):string|null;
