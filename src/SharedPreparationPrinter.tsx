import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { printerSettings } from './lib/printing'
import { cloudRequest } from './lib/cloudRequest'
import { checkoutTillId } from './lib/checkoutTill'
import type { CounterOrder } from './CounterService'
type Job = { id: string; state: string; station: 'kitchen' | 'bar'; order: CounterOrder; error?: string }
export function SharedPreparationPrinter({ headers, scope, owner, configure, apiUrl, token, onToken, print }: { headers: Record<string,string>; scope: string; owner: boolean; configure: boolean; apiUrl: string; token: string; onToken: (token:string,refresh:string)=>void; print:(order:CounterOrder,station?:'kitchen'|'bar')=>Promise<void> }) {
  const [jobs,setJobs]=useState<Job[]>([]),[shared,setShared]=useState(false),[designated,setDesignated]=useState(false),[message,setMessage]=useState('')
  const printRef=useRef(print);printRef.current=print
  async function local(action:string,body?:unknown) {
    const response=await fetch('/api/preparation-print/'+action,{headers:{...headers,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Printer queue unavailable.');return data
  }
  useEffect(()=>{
    let active=true,busy=false
    const poll=async()=>{
      if(busy)return;busy=true
      try {
        const data=await local('jobs');if(!active)return
        localStorage.setItem('stockroom-shared-print:'+scope,JSON.stringify(Boolean(data.shared)))
        setShared(Boolean(data.shared));setDesignated(Boolean(data.designated));setJobs(data.jobs||[]);setMessage('')
        for(const job of (data.jobs||[]) as Job[]){
          if(!active||job.state!=='pending')continue
          if(!printerSettings()[job.station]) {setMessage(`Select a ${job.station} printer in Devices before handling queued tickets.`);continue}
          const claim=await local('claim',{id:job.id});if(!claim.claimed)continue
          let error='';try{await printRef.current(job.order,job.station)}catch(caught){error=caught instanceof Error?caught.message:'Printing failed.'}
          // If acknowledgement fails, the cloud keeps "printing" for explicit review.
          const result=await local('result',{id:job.id,attemptId:claim.attemptId,...(error?{error}:{})})
          if(!result.saved)throw new Error('This printing attempt changed. Review the ticket before retrying.')
        }
      }catch(error){if(active)setMessage(error instanceof Error?error.message:'Printing queue unavailable.')}
      finally{busy=false}
    };void poll();const timer=setInterval(poll,5000);return()=>{active=false;clearInterval(timer)}
  },[headers.Authorization,headers['X-Stockroom-Branch'],scope])
  if(!configure&&!shared&&!message)return null
  return <section className="panel"><h3>Shared kitchen and bar printing</h3><p>{shared?(designated?'This checkout handles the shared preparation queue. Keep the app open and connected.':'Orders print on the branch’s designated checkout after synchronization.'):'Shared printing is off. Automatic local printer routing remains available.'}</p>{configure&&owner&&<><p>Use a Windows checkout with installed kitchen/bar printers. New orders and corrections from other devices enter this queue after synchronization. Historical orders are not replayed.</p><AsyncButton className="primary-button" onClick={async()=>{
    const response=await fetch('/api/till-recovery/register',{method:'POST',headers:{...headers,'X-Stockroom-Till':checkoutTillId()}});const data=await response.json();if(!response.ok)throw new Error(data.error||'Enroll this device first.')
    await cloudRequest(apiUrl,'/v1/preparation-print/configure',{method:'POST',body:JSON.stringify({deviceId:data.deviceId,branchId:headers['X-Stockroom-Branch']||'main',enabled:true})},onToken,token)
    localStorage.setItem('stockroom-shared-print:'+scope,'true');setShared(true);setDesignated(true);setMessage('Shared printing enabled. Tickets will appear after devices synchronize.')
  }}>Use this checkout as branch printer</AsyncButton>{designated&&<AsyncButton className="filter-button" onClick={async()=>{
    const response=await fetch('/api/till-recovery/register',{method:'POST',headers:{...headers,'X-Stockroom-Till':checkoutTillId()}});const data=await response.json();if(!response.ok)throw new Error(data.error)
    await cloudRequest(apiUrl,'/v1/preparation-print/configure',{method:'POST',body:JSON.stringify({deviceId:data.deviceId,branchId:headers['X-Stockroom-Branch']||'main',enabled:false})},onToken,token);localStorage.setItem('stockroom-shared-print:'+scope,'false');setShared(false);setDesignated(false)
  }}>Disable shared printing</AsyncButton>}</>}{message&&<p role="status">{message}</p>}{jobs.filter(job=>job.state!=='pending').map(job=><div key={job.id}><p>{job.station} · {job.order.id.slice(-8)} · {job.error||'Printing was interrupted or acknowledgement is uncertain.'}</p><AsyncButton className="filter-button" onClick={()=>local('retry',{id:job.id,confirmDuplicateRisk:true})}>Retry ticket (may print twice)</AsyncButton></div>)}</section>
}
