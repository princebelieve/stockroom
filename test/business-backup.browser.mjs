import { createServer } from 'vite'
import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const server=await createServer({server:{port:0,host:'127.0.0.1',hmr:false}});await server.listen()
const browser=await chromium.launch({channel:'msedge',headless:true})
try{
 const page=await browser.newPage();page.setDefaultTimeout(15000);const requests=[]
 await page.route('**/api/backups/restore',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Current owner password is incorrect.'})})})
 const base=`http://127.0.0.1:${server.httpServer.address().port}`;await page.route(base+'/harness',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto(base+'/harness')
 await page.evaluate(async()=>{window.stockroomDesktop={};const{React,createRoot}=await import('/test/shop-setup-harness.ts');const{BusinessBackup}=await import('/src/BusinessBackup.tsx');createRoot(document.getElementById('root')).render(React.createElement(BusinessBackup,{headers:{Authorization:'Bearer local-owner'}}))})
 await page.getByLabel('Choose backup to restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'stockroom-encrypted-backup-v1'}))})
 await page.getByRole('button',{name:'Review restore'}).click();const dialog=page.getByRole('alertdialog'),confirm=dialog.getByRole('button',{name:'Confirm restore'})
 assert.equal(await confirm.isDisabled(),true);assert.match(await confirm.getAttribute('class'),/closure-confirm/)
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(requests.length,0)
 await page.getByRole('button',{name:'Review restore'}).click();await dialog.getByLabel('Password used for this backup').fill('long-backup-password');await dialog.getByLabel('Current owner password').fill('incorrect-owner-password');await dialog.getByLabel('Type RESTORE').fill('RESTORE')
 await confirm.click();await page.getByRole('alert').getByText('Current owner password is incorrect.').waitFor()
 assert.equal(requests.length,1);assert.equal(requests[0].confirmation,'RESTORE')
 console.log('PASS: backup restore danger dialog, Cancel, disabled red confirm and recoverable authentication failure')
}finally{await browser.close();await server.close()}
