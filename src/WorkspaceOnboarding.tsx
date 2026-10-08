import { useState } from 'react'
import { Store, MapPin, WalletCards } from 'lucide-react'
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
  const key=workspaceSetupKey(businessId)
  const [step,setStep]=useState(()=>Math.max(0,Math.min(2,Number(localStorage.getItem(key)||0)||0)))
  const [preset,setPreset]=useState(()=>Object.entries(businessPresets).find(([,item])=>item.industry===profile.industry&&item.workflow===profile.workflows)?.[0]||'retail')
  const [nextCurrency,setCurrency]=useState(currency)
  const [timeZone,setTimeZone]=useState(profile.reportingTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC')
  const [provider,setProvider]=useState(policy.providers[0]||'')
  const [usePos,setUsePos]=useState(policy.providers.length>0)
  const icons=[Store,MapPin,WalletCards],Icon=icons[step]
  const titles=['How do you sell?','Your business location','How will customers pay?']
  async function next(){
    if(step===0)await saveProfile(applyBusinessPreset(profile,preset))
    if(step===1){await saveProfile({...profile,reportingTimeZone:timeZone});await savePreferences(nextCurrency,policy)}
    if(step===2){
      const providers=usePos?[provider.trim(),...policy.providers.filter(value=>value!==policy.providers[0])]:[]
      await savePreferences(nextCurrency,{...policy,providers})
      finish();return
    }
    localStorage.setItem(key,String(step+1));setStep(step+1)
  }
  return <main className="login-screen"><AsyncForm className="login-card workspace-onboarding" busyLabel="Saving..." onSubmit={next}>
    <div className="brand-mark"><Icon size={24}/></div><span className="setup-progress">Step {step+1} of 3</span><h1>{titles[step]}</h1>
    {step===0&&<><label htmlFor="setup-workspace-type">Business type</label><select id="setup-workspace-type" value={preset} onChange={event=>setPreset(event.target.value)}>{Object.entries(businessPresets).map(([id,item])=><option key={id} value={id}>{item.label}</option>)}</select></>}
    {step===1&&<><label htmlFor="setup-currency">Currency</label><select id="setup-currency" value={nextCurrency} onChange={event=>setCurrency(event.target.value)}>{[...new Set([currency,'NGN','USD','GHS','KES','ZAR','GBP','EUR','XOF'])].map(code=><option key={code}>{code}</option>)}</select><TimeZoneSelect value={timeZone} onChange={setTimeZone}/></>}
    {step===2&&<><div className="setup-payment-row"><WalletCards size={22}/><span>Cash</span><span>Ready</span></div><label className="checkbox-label"><input type="checkbox" checked={usePos} onChange={event=>setUsePos(event.target.checked)}/>Add a POS payment provider</label>{usePos&&<label>POS provider<input required value={provider} onChange={event=>setProvider(event.target.value)} placeholder="Bank or provider name" maxLength={100}/></label>}</>}
    <SubmitButton className="primary-button login-button">{step===2?'Open my workspace':'Continue'}</SubmitButton>
    {step>0&&<button type="button" className="text-button" onClick={()=>{localStorage.setItem(key,String(step-1));setStep(step-1)}}>Back</button>}
    <button type="button" className="text-button" onClick={finish}>Set up later</button>
  </AsyncForm></main>
}
