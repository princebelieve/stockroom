import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'

const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}})
await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
  const page=await browser.newPage();page.setDefaultTimeout(15000)
  const bookings=[],requests=[]
  let mode='hotel'
  await page.route('**/v1/customer-portal/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,input=route.request().method()==='POST'?route.request().postDataJSON():null
    requests.push({path,input})
    let data
    if(path.endsWith('/catalog'))data=mode==='hotel'?{businessName:'Harbour House',currency:'NGN',mode,rooms:[{id:'hotel-room:suite',branchId:'main',name:'Suite 1',nightlyRate:120,available:true}]}:{businessName:'Harbour House',currency:'NGN',mode,tableReservationsEnabled:true,events:[{id:'nightclub-event:friday',branchId:'main',name:'Friday Live',startsAt:'2099-10-02T20:00:00.000Z',admissionPrice:25,capacity:20,spotsRemaining:19,ticketTypes:[{id:'general',name:'General',price:25,spotsRemaining:19}],tables:[{id:'table:vip',name:'VIP 1',seats:6}]}]}
    else if(path.endsWith('/guest'))data={accessToken:'guest-token'}
    else if(path.endsWith('/hospitality/bookings')&&route.request().method()==='GET')data={bookings}
    else if(path.endsWith('/hospitality/cancel')){const booking=bookings.find(row=>row.id===input.bookingId);booking.status='cancelled';data={booking}}
    else if(path.endsWith('/hospitality/bookings')){const booking={id:`${mode}-booking`,kind:mode==='hotel'?'hotel-stay':'nightclub-entry',status:mode==='hotel'?'booked':'expected',guestName:'Ada Guest',guestPhone:input.phone,roomName:'Suite 1',checkIn:input.checkIn,checkOut:input.checkOut,eventName:'Friday Live',admissionPrice:25,checkInToken:'a'.repeat(32),invoices:[]};bookings.push(booking);data={booking}}
    else if(path.endsWith('/hospitality/table-reservations')){const booking={id:'reservation:portal-test',kind:'nightlife-table',status:'confirmed',eventName:'Friday Live',tableName:'VIP 1',guests:input.guests,startAt:'2099-10-02T20:00:00.000Z'};bookings.push(booking);data={booking}}
    else if(path.endsWith('/me'))data={guest:true,customer:{id:'guest',name:'Ada Guest',phone:'',balance:0},transactions:[],orders:[]}
    else throw new Error(`Unexpected customer portal request ${path}`)
    await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
  })
  const base=`http://127.0.0.1:${server.httpServer.address().port}`
  await page.route(`${base}/hospitality-harness*`,route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  const mount=()=>page.evaluate(async()=>{const {React,createRoot}=await import('/test/shop-setup-harness.ts');const {CustomerPortal}=await import('/src/CustomerPortal.tsx');createRoot(document.getElementById('root')).render(React.createElement(CustomerPortal,{businessId:'shop'}))})
  await page.goto(`${base}/hospitality-harness?customer=shop&catalog=hotel`,{waitUntil:'domcontentloaded'});await mount()
  await page.getByLabel('Guest name').fill('Ada Guest');await page.getByLabel('Phone number').fill('08000000001');await page.getByRole('button',{name:'Continue as guest'}).click()
  await page.getByLabel('Contact phone').fill('08000000001');await page.getByLabel('Email for confirmation and reminder').fill('ada@example.com');await page.getByLabel('Room type').selectOption('hotel-room:suite');await page.getByLabel('Check in').fill('2099-10-01');await page.getByLabel('Check out').fill('2099-10-03');await page.getByRole('button',{name:'Reserve stay'}).click()
  try{await page.getByRole('heading',{name:/Suite 1/}).waitFor()}catch(error){console.error('Customer hotel booking debug:',JSON.stringify({requests,body:(await page.locator('body').innerText()).slice(-1800)}));throw error}
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cancel booking'}).click();await page.getByText('Status: cancelled').waitFor()
  const hotelRequest=requests.find(row=>row.path.endsWith('/hospitality/bookings')&&row.input?.type==='hotel');assert.equal(hotelRequest.input.roomId,'hotel-room:suite');assert.equal(hotelRequest.input.checkOut,'2099-10-03')
  mode='nightlife';await page.evaluate(()=>{sessionStorage.clear();history.replaceState({},'',location.pathname+'?customer=shop&catalog=nightlife')});await page.reload({waitUntil:'domcontentloaded'});await mount()
  await page.getByLabel('Guest name').fill('Ada Guest');await page.getByLabel('Phone number').fill('08000000001');await page.getByRole('button',{name:'Continue as guest'}).click()
  await page.getByLabel('Contact phone').first().fill('08000000001');await page.getByLabel('Email for confirmation and reminder').first().fill('ada@example.com');await page.getByRole('radio',{name:/Friday Live/}).check({noWaitAfter:true});await page.getByRole('button',{name:'Reserve admission'}).click()
  await page.getByRole('img',{name:'Hospitality check-in pass'}).waitFor()
  const ticketRequest=requests.find(row=>row.path.endsWith('/hospitality/bookings')&&row.input?.type==='nightlife');assert.equal(ticketRequest.input.eventId,'nightclub-event:friday')
  await page.getByRole('combobox',{name:'Event'}).selectOption('nightclub-event:friday');await page.getByLabel('Table').selectOption('table:vip');await page.getByRole('spinbutton',{name:'Guests'}).fill('4');await page.getByRole('button',{name:'Reserve table'}).click()
  const tableRequest=requests.find(row=>row.path.endsWith('/hospitality/table-reservations'));assert.equal(tableRequest.input.tableId,'table:vip');assert.equal(tableRequest.input.guests,4)
  console.log('PASS: hotel guest reservation, event admission, table reservation, and guest QR pass display.')
}finally{await browser.close();await server.close()}
