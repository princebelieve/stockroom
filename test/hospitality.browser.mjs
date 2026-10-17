import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import { normalizeShopProfile } from '../server/shop-profile.mjs'

const data=await mkdtemp(join(tmpdir(),'stockroom-hospitality-browser-'))
const base='http://127.0.0.1:9687'
const cloud=createServer(async(request,response)=>{
  response.setHeader('Content-Type','application/json')
  if(request.url==='/v1/sync/capabilities'){response.end(JSON.stringify({capabilities:['counter-v3','restaurant-v2','hospitality-operations-v1','hotel-shift-handoff-v1','hotel-reservation-deposits-v1','hotel-group-reschedule-v1','restaurant-hotel-folio-v1']}));return}
  if(request.url.startsWith('/v1/sync/push')){let raw='';for await(const chunk of request)raw+=chunk;response.end(JSON.stringify({acceptedOperationIds:JSON.parse(raw).operations.map(row=>row.operationId),conflicts:[]}));return}
  if(request.url.startsWith('/v1/sync/pull')){response.end(JSON.stringify({operations:[],cursor:''}));return}
  response.end(JSON.stringify({businessId:'hospitality-test',testMode:true}))
})
await new Promise(resolve=>cloud.listen(9689,'127.0.0.1',resolve))
const child=spawn(process.execPath,['server/index.mjs'],{env:{...process.env,PORT:'9687',CUSTOMER_DISPLAY_PORT:'9688',STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),SYNC_API_URL:'http://127.0.0.1:9689',SYNC_DEVICE_TOKEN:'test',BUSINESS_ID:'hospitality-test',DEVICE_ID:'hospitality-device'},stdio:'ignore'})
let browser
try{
  for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok)break}catch{};await new Promise(resolve=>setTimeout(resolve,100))}
  const account=await(await fetch(base+'/api/setup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appName:'Harbour House',ownerName:'Owner',email:'hospitality@test.local',password:'long-test-password'})})).json()
  assert.ok(account.token)
  const headers={'Content-Type':'application/json',Authorization:`Bearer ${account.token}`}
  const settings=await(await fetch(base+'/api/settings',{headers})).json()
  const profile=normalizeShopProfile({...settings.shopProfile,workflows:'both',restaurant:true,features:{...settings.shopProfile?.features,hotelOperations:true,nightlifeOperations:true,hospitalityOperations:true}})
  const configured=await fetch(base+'/api/settings/shop-profile',{method:'PUT',headers,body:JSON.stringify(profile)})
  assert.equal(configured.status,200,await configured.text())
  browser=await chromium.launch({channel:'msedge',headless:true})
  const page=await browser.newPage({viewport:{width:1366,height:900}})
  page.setDefaultTimeout(15000)
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort())
  await page.route('**/api/subscriptions/access',route=>route.fulfill({json:{testMode:true,blocked:false,status:'test'}}))
  await page.addInitScript(account=>{localStorage.setItem('stockroom-token',account.token);localStorage.setItem('stockroom-user',JSON.stringify(account.user))},account)
  await page.goto(base)
  await page.locator('[aria-label="Subscription: test"]').waitFor()
  const openHospitality=async()=>{const button=page.getByRole('button',{name:'Hotel & nightlife',exact:true});if(!await button.isVisible())await page.getByRole('button',{name:'Sales & orders',exact:true}).click();await button.click()}
  await openHospitality()
  const hospitality=page.locator('.hospitality-operations')
  await hospitality.getByRole('heading',{name:'Hospitality operations'}).waitFor()

  await hospitality.getByLabel('Room name or number').fill('Suite 1')
  await hospitality.getByLabel('Nightly rate').fill('120')
  await hospitality.getByRole('button',{name:'Add room',exact:true}).click()
  const room=hospitality.locator('article.customer-row:has(select[name="housekeepingStatus"])').filter({hasText:'Suite 1'}).first()
  await room.locator('select[name="housekeepingStatus"]').selectOption('ready')
  await room.locator('select[name="housekeepingAssignedTo"]').selectOption({label:'Owner'})
  await room.locator('input[name="housekeepingScheduledAt"]').fill('2099-10-01T10:00')
  await room.getByRole('button',{name:'Save room and housekeeping'}).click()
  await room.getByText(/Assigned to Owner/).waitFor()

  const roomSelect=hospitality.locator('select[name="roomId"]:not([multiple])')
  const roomId=await roomSelect.locator('option').nth(1).getAttribute('value')
  await roomSelect.selectOption(roomId)
  await hospitality.getByLabel('Guest name').fill('Ada Guest')
  await hospitality.getByLabel('Phone',{exact:true}).fill('08000000001')
  await hospitality.locator('input[name="checkin"]').fill('2099-10-01')
  await hospitality.locator('input[name="checkout"]').fill('2099-10-03')
  await hospitality.getByLabel('Stay manager').selectOption({label:'Owner'})
  await hospitality.getByRole('button',{name:'Save booking'}).click()
  const stay=hospitality.locator('.customer-row').filter({hasText:'Ada Guest'})
  await stay.getByRole('button',{name:'Create stay invoice'}).click()
  const payments=page.locator('.service-payments')
  await payments.getByRole('button',{name:'Jobs & invoices',exact:true}).click()
  const jobs=payments.locator('.service-jobs')
  await jobs.getByRole('heading',{name:'Jobs & invoices'}).waitFor()
  await jobs.getByRole('button',{name:'Take payment',exact:true}).click()
  await jobs.getByRole('button',{name:'Save invoice payment',exact:true}).click()
  await jobs.getByText(/Payment saved/).waitFor()
  const hotelInvoice=(await(await fetch(base+'/api/pos/hospitality',{headers})).json()).invoices.find(job=>job.hospitality.recordKind==='hotel-stay')
  assert.ok(hotelInvoice);assert.equal(hotelInvoice.balance.due,0)
  await openHospitality()
  await stay.getByRole('button',{name:'Check in',exact:true}).click()
  await stay.getByText(/checked-in/).waitFor()
  await stay.getByRole('button',{name:'Check out',exact:true}).click()
  await stay.getByText(/checked-out/).waitFor()
  const hotelState=await(await fetch(base+'/api/pos/hospitality',{headers})).json()
  assert.equal(hotelState.rooms.find(item=>item.roomName==='Suite 1').housekeepingStatus,'dirty')

  await hospitality.getByRole('button',{name:'Nightlife events',exact:true}).click()
  await hospitality.getByLabel('Event name').fill('Friday Live')
  await hospitality.getByLabel('Starts').fill('2099-10-02T20:00')
  await hospitality.getByLabel('Ends').fill('2099-10-02T23:00')
  await hospitality.getByLabel('Guest capacity').fill('50')
  await hospitality.getByLabel('Admission price').fill('25')
  await hospitality.getByLabel('Event host').first().selectOption({label:'Owner'})
  await hospitality.getByLabel('Door staff lead').first().selectOption({label:'Owner'})
  await hospitality.getByRole('button',{name:'Create event'}).click()
  const event=hospitality.locator('.panel').filter({hasText:'Friday Live'}).last()
  assert.match(await event.innerText(),/Owner/)
  await event.getByLabel('Guest',{exact:true}).fill('Ben Guest')
  await event.getByLabel('Phone',{exact:true}).fill('08000000002')
  await event.getByRole('button',{name:'Add guest'}).click()
  const guest=event.locator('.customer-row').filter({hasText:'Ben Guest'})
  const unpaidGuest=(await(await fetch(base+'/api/pos/hospitality',{headers})).json()).entries.find(entry=>entry.guestName==='Ben Guest')
  const unpaidScan=await fetch(base+'/api/pos/hospitality',{method:'POST',headers,body:JSON.stringify({action:'scan-check-in',eventId:unpaidGuest.eventId,token:unpaidGuest.checkInToken})})
  assert.equal(unpaidScan.status,400,'unpaid tickets must not pass QR check-in')
  await guest.getByRole('button',{name:'Create admission invoice'}).click()
  const admissionJob=(await(await fetch(base+'/api/pos/service-jobs',{headers})).json()).jobs.find(job=>job.hospitality?.recordKind==='nightclub-entry')
  await page.waitForFunction(id=>Object.entries(localStorage).some(([key,value])=>key.endsWith(':selected-job')&&value===id),admissionJob?.id)
  await payments.getByRole('button',{name:'Jobs & invoices',exact:true}).click()
  await jobs.getByRole('button',{name:'Take payment',exact:true}).click()
  await jobs.getByRole('button',{name:'Save invoice payment',exact:true}).click()
  await jobs.getByText(/Payment saved/).waitFor()
  await openHospitality()
  await hospitality.getByRole('button',{name:'Nightlife events',exact:true}).click()
  const liveEvent=hospitality.locator('.panel').filter({hasText:'Friday Live'}).last()
  const admitted=liveEvent.locator('.customer-row').filter({hasText:'Ben Guest'})
  const issuedGuest=(await(await fetch(base+'/api/pos/hospitality',{headers})).json()).entries.find(entry=>entry.guestName==='Ben Guest')
  assert.ok(issuedGuest.checkInToken)
  const scanned=await fetch(base+'/api/pos/hospitality',{method:'POST',headers,body:JSON.stringify({action:'scan-check-in',eventId:issuedGuest.eventId,token:issuedGuest.checkInToken})})
  assert.equal(scanned.status,200,await scanned.text())
  const duplicateScan=await fetch(base+'/api/pos/hospitality',{method:'POST',headers,body:JSON.stringify({action:'scan-check-in',eventId:issuedGuest.eventId,token:issuedGuest.checkInToken})})
  assert.equal(duplicateScan.status,400,'a checked-in pass must not be accepted twice')
  await admitted.getByText(/checked-in/).waitFor()
  assert.deepEqual(errors,[])
  console.log('PASS: hotel room, housekeeping assignment and schedule, stay booking/invoice/payment/check-in/check-out; nightlife event, guest admission invoice/payment/check-in')
}catch(error){
  if(browser){const page=browser.contexts()[0]?.pages()[0];if(page)try{console.log('DEBUG PAGE:',(await page.locator('body').innerText({timeout:2000})).slice(0,5000))}catch{}}
  throw error
}finally{
  if(browser)await browser.close()
  child.kill();await once(child,'exit').catch(()=>{})
  await rm(data,{recursive:true,force:true});cloud.close()
}
