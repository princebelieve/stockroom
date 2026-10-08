import { useState } from 'react'
import { effectivePermissions } from '../server/staff-permissions.mjs'
import { workspaceCapabilities } from '../server/workspace-capabilities.mjs'
import type { ShopProfile } from '../server/shop-profile.mjs'
import { AsyncButton } from './AsyncControls'
export function StaffPermissions({member,profile,save}:{member:any;profile:ShopProfile;save:(id:string,permissions:Record<string,boolean>)=>Promise<void>}){
 const [draft,setDraft]=useState<Record<string,boolean>|null>(null)
 return <details className="staff-permissions"><summary>Choose staff access</summary><fieldset><legend>Operations allowed</legend><div className="staff-permission-options">{Object.entries(workspaceCapabilities(profile)).map(([key,label])=><label key={key}><input type="checkbox" checked={Boolean((draft||effectivePermissions(member))[key])} onChange={event=>setDraft({...draft||effectivePermissions(member),[key]:event.target.checked})}/><span>{label}</span></label>)}</div></fieldset><AsyncButton className="primary-button" disabled={!draft} onClick={async()=>{await save(member.id,draft!);setDraft(null)}}>Save staff access</AsyncButton>{draft&&<button type="button" className="filter-button" onClick={()=>setDraft(null)}>Cancel changes</button>}</details>
}
