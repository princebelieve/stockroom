import { useState } from 'react'
import { AsyncForm, SubmitButton } from './AsyncControls'
import { birthdayCustomers } from '../server/customer-birthdays.mjs'
import type { Customer } from './types'
export function BirthdayReminders({customers,timeZone}:{customers:Customer[];timeZone:string}) {
 const today=birthdayCustomers(customers,new Date(),timeZone)
 return <section className="panel"><h2>Customer birthdays</h2>{today.length?today.map(customer=><p key={customer.id}>{customer.name}{customer.phone?' / '+customer.phone:''} has a birthday today.</p>):<p>No birthday reminders today.</p>}<p>Save a month and day on a customer account to enable reminders. Greetings are sent by your staff, not automatically.</p></section>
}
export function CustomerBirthday({customer,headers,saved}:{customer:Customer;headers:Record<string,string>;saved:(customer:Customer)=>void}) {
 const [birthday,setBirthday]=useState(customer.birthday||'');const [enabled,setEnabled]=useState(Boolean(customer.birthdayReminders))
 return <details><summary>Birthday reminder</summary><AsyncForm onSubmit={async()=>{const response=await fetch('/api/customers/'+encodeURIComponent(customer.id)+'/birthday',{method:'PUT',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({birthday,birthdayReminders:enabled})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save birthday.');saved(result)}}><label>Birthday (MM-DD)<input required={enabled} pattern="[0-9]{2}-[0-9]{2}" placeholder="07-25" value={birthday} onChange={event=>setBirthday(event.target.value)}/></label><label><input type="checkbox" checked={enabled} onChange={event=>setEnabled(event.target.checked)}/>Remind staff on this birthday</label><SubmitButton>Save birthday reminder</SubmitButton></AsyncForm></details>
}
