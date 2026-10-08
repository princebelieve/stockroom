import type { ProductDraft } from './productIntake'
type Reference = {businessId:string;barcode:string;name:string;searchName:string;category:string;unit:string}
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('stockroom-reference-catalogue',1);request.onupgradeneeded=()=>{const store=request.result.createObjectStore('references',{keyPath:['businessId','barcode']});store.createIndex('name',['businessId','searchName'])};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export async function saveReferenceCatalogue(businessId:string,drafts:ProductDraft[]) {
 if(!drafts.length||drafts.length>100000)throw new Error('Choose a reference catalogue with between 1 and 100,000 rows.')
 const rows:Reference[]=drafts.map(draft=>{const barcode=(draft.barcode||'').trim(),name=draft.name.trim();if(!name||name.length>180||!/^\S{3,200}$/.test(barcode))throw new Error('Every reference row needs a product name and barcode.');return {businessId,barcode,name,searchName:name.toLowerCase(),category:(draft.category||'').slice(0,80),unit:(draft.unit||'').slice(0,30)}})
 const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('references','readwrite');const store=tx.objectStore('references');rows.forEach(row=>store.put(row));tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||new Error('Could not store the reference catalogue.'))})}finally{db.close()}
 return new Set(rows.map(row=>row.barcode)).size
}
export async function findReferenceBarcode(businessId:string,barcode:string):Promise<ProductDraft|null>{
 const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('references');const request=tx.objectStore('references').get([businessId,barcode]);request.onsuccess=()=>{const row=request.result as Reference|undefined;resolve(row?{name:row.name,barcode:row.barcode,category:row.category,unit:row.unit}:null)};request.onerror=()=>reject(request.error)})}finally{db.close()}
}
export async function searchReferenceCatalogue(businessId:string,query:string):Promise<ProductDraft[]>{
 const term=query.trim().toLowerCase();if(!term)return []
 const db=await open();try{return await new Promise((resolve,reject)=>{const rows:ProductDraft[]=[];const request=db.transaction('references').objectStore('references').index('name').openCursor(IDBKeyRange.bound([businessId,term],[businessId,term+'\uffff']));request.onsuccess=()=>{const cursor=request.result;if(!cursor||rows.length>=30){resolve(rows);return}const row=cursor.value as Reference;rows.push({name:row.name,barcode:row.barcode,category:row.category,unit:row.unit});cursor.continue()};request.onerror=()=>reject(request.error)})}finally{db.close()}
}
