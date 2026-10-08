import {createServer} from 'node:http'
import {chromium} from '@playwright/test'
import assert from 'node:assert/strict'
import {corsHeadersFor} from '../cloud/cors.mjs'

let fixed=false,uploads=0
const pageServer=createServer((request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Sync transport check</title>')})
await new Promise(resolve=>pageServer.listen(0,'127.0.0.1',resolve))
const origin=`http://127.0.0.1:${pageServer.address().port}`
const cloud=createServer(async(request,response)=>{
  const headers=corsHeadersFor(request.headers.origin,origin)
  if(!fixed)headers['Access-Control-Allow-Headers']='Content-Type, Authorization, X-Admin-Key'
  for(const [key,value]of Object.entries(headers))response.setHeader(key,value)
  if(request.method==='OPTIONS'){response.writeHead(204);response.end();return}
  response.setHeader('Content-Type','application/json')
  if(request.headers['x-stockroom-staff-permissions']!=='staff-permissions-v1'){response.writeHead(426);response.end(JSON.stringify({error:'Staff permissions capability required'}));return}
  let raw='';for await(const chunk of request)raw+=chunk
  const {operations}=JSON.parse(raw);uploads++
  response.end(JSON.stringify({acceptedOperationIds:operations.map(row=>row.operationId)}))
})
await new Promise(resolve=>cloud.listen(0,'127.0.0.1',resolve))
const endpoint=`http://127.0.0.1:${cloud.address().port}/v1/sync/push`
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
  const page=await browser.newPage()
  await page.goto(origin)
  const upload=()=>page.evaluate(async endpoint=>{
    try{const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer test-device','X-Stockroom-Staff-Permissions':'staff-permissions-v1'},body:JSON.stringify({operations:[{operationId:'test-setup',entityType:'settings',payload:{currency:'NGN'}}]})});return {status:response.status,data:await response.json()}}catch(error){return {error:error.message}}
  },endpoint)
  assert.match((await upload()).error,/fetch/i)
  assert.equal(uploads,0,'Rejected preflight must not upload records')
  fixed=true
  const result=await upload()
  assert.equal(result.status,200)
  assert.deepEqual(result.data.acceptedOperationIds,['test-setup'])
  assert.equal(uploads,1)
  console.log('PASS: actual browser reproduces blocked sync preflight; corrected CORS permits upload with staff-permission enforcement intact')
}finally{await browser.close();await Promise.all([pageServer,cloud].map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()})))}
