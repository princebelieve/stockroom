import { useState } from 'react'
import { Store } from 'lucide-react'
import { AsyncForm, SubmitButton } from './AsyncControls'
import { TimeZoneSelect } from './TimeZoneSelect'
import { applyBusinessPreset, businessPresets, type ShopProfile } from '../server/shop-profile.mjs'
import type { PaymentPolicy } from '../server/payment.mjs'

export const workspaceSetupKey=(businessId:string)=>`stockroom-workspace-setup:${businessId}`

export function WorkspaceOnboarding({businessId,profile,currency,policy,saveProfile,savePreferences,finish}:{
  businessId:string;profile:ShopProfile;currency:string;policy:PaymentPolicy;
  saveProfile:(profile:ShopProfile)=>Promise<void>;
  savePreferences:(currency:string,policy:PaymentPolicy)=>Promise<void>;
  finish:()=>void;
}) {
  const [preset,setPreset]=useState(()=>Object.entries(businessPresets).find(([,item])=>item.industry===profile.industry&&item.workflow===profile.workflows)?.[0]||'retail')
  const [nextCurrency,setCurrency]=useState(currency)
  const [timeZone,setTimeZone]=useState(profile.reportingTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')
  const [provider,setProvider]=useState(policy.providers[0]||'')
  const [usePos,setUsePos]=useState(policy.providers.length>0)
  async function next(){
    await saveProfile({...applyBusinessPreset(profile,preset),reportingTimeZone:timeZone})
    const providers=usePos&&provider.trim()?[provider.trim(),...policy.providers.filter(value=>value!==policy.providers[0]&&value!==provider.trim())]:[]
    await savePreferences(nextCurrency,{...policy,providers})
    finish()
  }
  return <main className="login-screen"><AsyncForm className="login-card workspace-onboarding" busyLabel="Saving..." onSubmit={next}>
    <div className="brand-mark"><Store size={24}/></div><h1>Set up your business</h1>
    <p>Choose what best describes your business. You can change this later.</p>
    <label htmlFor="setup-workspace-type">Business type</label><select id="setup-workspace-type" value={preset} onChange={event=>setPreset(event.target.value)}>{Object.entries(businessPresets).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select>
    <details className="setup-optional"><summary>Currency, time zone and other payment methods</summary>
      <label htmlFor="setup-currency">Currency</label><select id="setup-currency" value={nextCurrency} onChange={event=>setCurrency(event.target.value)}>{[...new Set([currency,'NGN','USD','GHS','KES','ZAR','GBP','EUR','XOF'])].map(code=><option key={code}>{code}</option>)}</select>
      <TimeZoneSelect value={timeZone} onChange={setTimeZone}/>
      <div className="setup-payment-row"><span>Cash</span><span>Ready</span></div>
      <label className="checkbox-label"><input type="checkbox" checked={usePos} onChange={event=>setUsePos(event.target.checked)}/>Add a POS payment method</label>{usePos&&<label>Provider name<input required value={provider} onChange={event=>setProvider(event.target.value)} placeholder="Bank or provider name" maxLength={100}/></label>}
    </details>
    <SubmitButton className="primary-button login-button">Open my workspace</SubmitButton>
    <button type="button" className="text-button" onClick={finish}>Set up later</button>
  </AsyncForm></main>
}
