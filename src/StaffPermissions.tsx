import { useState } from 'react'
import { effectivePermissions, staffCapabilities } from '../server/staff-permissions.mjs'
import { AsyncButton } from './AsyncControls'
export function StaffPermissions({member,save}:{member:any;save:(id:string,permissions:Record<string,boolean>)=>Promise<void>}){
 const [draft,setDraft]=useState<Record<string,boolean>|null>(null)
 return <details><summary>Choose staff access</summary><p>These controls apply wherever the operation is available. Staff continue to sign in with their own account.</p>{Object.entries(staffCapabilities).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean((draft||effectivePermissions(member))[key])} onChange={event=>setDraft({...draft||effectivePermissions(member),[key]:event.target.checked})}/>{label}</label>)}<AsyncButton className="primary-button" disabled={!draft} onClick={async()=>{await save(member.id,draft!);setDraft(null)}}>Save staff access</AsyncButton>{draft&&<button type="button" onClick={()=>setDraft(null)}>Cancel changes</button>}</details>
}
