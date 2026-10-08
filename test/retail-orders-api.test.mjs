import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {once} from 'node:events'
import {createServer} from 'node:http'
const listen=async server=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port}
test('retail order payment deducts stock once and birthday updates preserve wallet balances offline',async()=>{
 const data=await mkdtemp(join(tmpdir(),'stockroom-retail-orders-'))
 const reserved=createServer();const port=await listen(reserved);await new Promise(resolve=>reserved.close(resolve))
 const display=createServer();const displayPort=await listen(display);await new Promise(resolve=>display.close(resolve))
 const cloud=createServer(async(request,response)=>{response.setHeader('Content-Type','application/json');if(request.url.includes('/sync/push')){let body='';for await(const chunk of request)body+=chunk;response.end(JSON.stringify({acceptedOperationIds:JSON.parse(body).operations.map(row=>row.operationId),conflicts:[]}))}else if(request.url.includes('/sync/pull'))response.end(JSON.stringify({operations:[],cursor:''}));else if(request.url.includes('/capabilities'))response.end(JSON.stringify({capabilities:['counter-v3','retail-orders-v1','staff-permissions-v1']}));else response.end(JSON.stringify({businessId:'retail-test',testMode:true}))})
 const cloudPort=await listen(cloud)
 const source=`const db=await import('./server/db.mjs');await db.createOwnerSetup({appName:'Retail',ownerName:'Owner',email:'retail@test.local',password:'long-test-password'});const owner=db.listUsers().find(row=>row.role==='owner');const staff=db.createUser({name:'Seller',username:'seller',password:'long-test-password',role:'cashier'});db.setStaffPermissions(staff.id,{productSales:true});const product=db.createProduct({name:'Rice',price:10,cost:4,stock:8,unit:'bag',category:'Food',sku:'RICE',reorder:1});const {posSettings,priceOrder}=await import('./server/pos-pricing.mjs');const {counterItems}=await import('./server/counter-service.mjs');const now=new Date().toISOString();const order={id:'online-retail-test',kind:'counter-order',retailOrder:true,source:'customer-portal',acceptedTillId:'retail-test-till',customerPortalId:'ada',tillId:'retail-test-till',branchId:'main',status:'queued',currency:'USD',businessName:'Retail',customerName:'Ada',note:'',createdAt:now,updatedAt:now,expectedUpdatedAt:'',lines:[{id:'rice-line',menuItemId:product.id,productId:product.id,name:'Rice',quantity:2,price:10,options:[],ingredients:[]}],events:[]};order.pos={tillId:order.tillId,customerId:'',customerName:'Ada',discountType:'amount',discountValue:0,loyaltyRedeemed:0,tax:posSettings(),note:''};order.pos.pricing=priceOrder(counterItems(order),order.pos);order.total=order.pos.pricing.total;db.database.prepare('INSERT INTO pos_records(scope,id,kind,branch_id,payload,updated_at) VALUES(?,?,?,?,?,?)').run(db.getUserById(owner.id).organizationId,order.id,order.kind,'main',JSON.stringify(order),now);const customer=db.createCustomer({name:'Ada',phone:'555'});db.adjustCustomerWallet(customer.id,150);console.log('SEED:'+JSON.stringify({owner:db.createSession(owner.id),staff:db.createSession(staff.id),product,customer,order}));await import('./server/index.mjs')`
 const child=spawn(process.execPath,['--input-type=module','-e',source],{env:{...process.env,PORT:String(port),CUSTOMER_DISPLAY_PORT:String(displayPort),STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),BUSINESS_ID:'retail-test',SYNC_API_URL:`http://127.0.0.1:${cloudPort}`,SYNC_DEVICE_TOKEN:'test',DEVICE_ID:'retail-device'},stdio:['ignore','pipe','pipe']})
 let output='',errors='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk)
 try{
  const base=`http://127.0.0.1:${port}`;let ready=false;for(let n=0;n<100;n++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}assert.ok(ready,output+errors)
  const seed=JSON.parse(output.split('SEED:')[1].split('\n')[0]),headers={'Content-Type':'application/json',Authorization:'Bearer '+seed.staff,'X-Stockroom-Till':'retail-test-till'}
  const orders=await fetch(base+'/api/pos/retail-orders',{headers});assert.equal(orders.status,200,await orders.clone().text());assert.equal((await orders.json()).orders[0].retailOrder,true)
  const sale={id:'counter-payment:'+seed.order.id,total:20,items:[{productId:seed.product.id,productName:'Rice',quantity:2,price:10}],currency:'USD',businessName:'Retail',createdAt:new Date().toISOString(),paymentMethod:'cash',paymentDetails:{amountReceived:20,pos:seed.order.pos,counterOrder:{id:seed.order.id,tillId:'retail-test-till',retailOrder:true}}}
  for(let n=0;n<2;n++){const payment=await fetch(base+'/api/sales',{headers,method:'POST',body:JSON.stringify(sale)});assert.equal(payment.status,201,await payment.text())}
  const products=await(await fetch(base+'/api/products',{headers})).json();assert.equal(products.products.find(row=>row.id===seed.product.id).stock,6)
  const update={birthday:'10-07',birthdayReminders:true},path=base+'/api/customers/'+seed.customer.id+'/birthday'
  assert.equal((await fetch(path,{headers,method:'PUT',body:JSON.stringify(update)})).status,403)
  const saved=await fetch(path,{headers:{...headers,Authorization:'Bearer '+seed.owner},method:'PUT',body:JSON.stringify(update)});assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).balance,150)
  const customers=await(await fetch(base+'/api/customers',{headers:{Authorization:'Bearer '+seed.owner}})).json();assert.equal(customers.customers[0].birthday,'10-07');assert.equal(customers.customers[0].balance,150)
 }finally{child.kill();await once(child,'exit').catch(()=>{});await new Promise(resolve=>cloud.close(resolve));await rm(data,{recursive:true,force:true})}
})
