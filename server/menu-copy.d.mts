export function menuCopyCandidates<T extends {id:string;name:string;copiedFrom?:{menuId:string;itemId:string}}>(source:{id:string;items:T[]},destination:T[]):Array<{item:T;exists:boolean}>
export function copyMenuItems<T extends {id:string;name:string;options:Array<{id:string}>}>(source:{id:string;items:T[]},destination:T[],selected:string[],restaurant:boolean,id?:()=>string):T[]
