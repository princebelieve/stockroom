import test from 'node:test'
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {createServer} from 'node:net'
import {once} from 'node:events'
const freePort=async()=>{const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));return port}
test('desktop enforces persisted individual grants on existing sessions and direct API calls',async()=>{
 const data=await mkdtemp(join(tmpdir(),'stockroom-permissions-')),port=await freePort(),display=await freePort()
 const source=`const db=await import('./server/db.mjs');db.createOwnerSetup({appName:'Shop',ownerName:'Owner',email:'owner@test.local',password:'long-test-password'});const cashier=db.createUser({name:'Cashier',username:'cashier',password:'long-test-password',role:'cashier'});db.setStaffPermissions(cashier.id,{inventory:true,productSales:true});const admin=db.createUser({name:'Admin',username:'admin',password:'long-test-password',role:'admin'});db.setStaffPermissions(admin.id,{counter:true});console.log('SEED:'+JSON.stringify({cashier:db.createSession(cashier.id),admin:db.createSession(admin.id)}));await import('./server/index.mjs')`
 const child=spawn(process.execPath,['--input-type=module','-e',source],{env:{...process.env,PORT:String(port),CUSTOMER_DISPLAY_PORT:String(display),STOCKROOM_DATA_DIR:data,SYNC_CONFIG_PATH:join(data,'sync.json'),BUSINESS_ID:'permissions-test'},stdio:['ignore','pipe','pipe']})
 let output='',errors='';child.stderr.on('data',chunk=>errors+=chunk);child.stdout.on('data',chunk=>output+=chunk)
 try{
  const base=`http://127.0.0.1:${port}`;let ready=false
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok){ready=true;break}}catch{}await new Promise(resolve=>setTimeout(resolve,50))}
  assert.ok(ready,output+errors)
  const tokens=JSON.parse(output.split('SEED:')[1].split('\n')[0]);const headers={Authorization:'Bearer '+tokens.cashier,'Content-Type':'application/json'}
  const session=await(await fetch(base+'/api/auth/session',{headers})).json();assert.deepEqual(session.user.permissions,{inventory:true,productSales:true})
  const product=await fetch(base+'/api/products',{method:'POST',headers,body:JSON.stringify({name:'Rice',sku:'RICE',category:'Food',unit:'bag',price:10,cost:4,stock:0,reorder:0})});assert.equal(product.status,201,await product.text())
  for(const [path,method,input] of [['/api/reports','GET'],['/api/pos/service-jobs','GET'],['/api/pos/restaurant','GET'],['/api/pos/returns','POST',{id:'r'}],['/api/users/other/permissions','PUT',{permissions:{inventory:true}}]]){
   const response=await fetch(base+path,{headers,method,body:input?JSON.stringify(input):undefined});assert.equal(response.status,403,path+':'+await response.text())
  }
  const restricted=await fetch(base+'/api/reports',{headers:{Authorization:'Bearer '+tokens.admin}});assert.equal(restricted.status,403)
  const ordinary=await fetch(base+'/api/sales',{headers,method:'POST',body:JSON.stringify({id:'bad-service',total:10,items:[{productId:'service:fee',productName:'Fee',quantity:1,price:10}],paymentMethod:'cash',createdAt:new Date().toISOString()})});assert.equal(ordinary.status,403)
 }finally{child.kill();await once(child,'exit').catch(()=>{});await rm(data,{recursive:true,force:true})}
})
