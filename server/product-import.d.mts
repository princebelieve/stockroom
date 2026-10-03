export const importFields: string[]
export function suggestImportMapping(header:string[]):Record<string,number>
export function mappedProducts(table:string[][],mapping?:Record<string,number>):any[]
export function importMatches(draft:any,products:any[]):any[]
