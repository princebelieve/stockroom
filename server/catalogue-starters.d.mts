export type CatalogueStarter={id:string;name:string;unit:string;category:string;stocked?:boolean};
export function catalogueStarters(kind:string,industry?:string):CatalogueStarter[];
export function missingStarters<T extends {name:string}>(starters:T[],existing:Array<{name:string}>):T[];
