import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createScheduledBackups } from '../desktop/scheduled-backups.mjs'
import { decryptBackup } from '../server/business-backup.mjs'
test('scheduled backups encrypt records, suppress early repeats and report unavailable storage',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'stockroom-backup-test-'))
 try{
 const api=createScheduledBackups({configPath:join(folder,'config.json'),chooseDirectory:async()=>folder,encryptSecret:secret=>Buffer.from('protected:'+secret),decryptSecret:bytes=>bytes.toString().slice(10),snapshot:async tillId=>({businessId:'shop',tillId,data:{sale:'receipt'}})})
 await api.configure({password:'long-backup-password',tillId:'till'})
 let files=(await readdir(folder)).filter(name=>name.startsWith('stockroom-'));assert.equal(files.length,1)
 assert.deepEqual(decryptBackup(JSON.parse(await readFile(join(folder,files[0]),'utf8')),'long-backup-password').data,{sale:'receipt'})
 assert.equal((await api.status()).secret,undefined)
 await api.run();assert.equal((await readdir(folder)).filter(name=>name.startsWith('stockroom-')).length,1)
 const config=JSON.parse(await readFile(join(folder,'config.json'),'utf8'));config.directory=join(folder,'unavailable-drive');await writeFile(join(folder,'config.json'),JSON.stringify(config))
 await api.run(true);assert.ok((await api.status()).lastError)
 await api.disable();assert.equal((await api.status()).enabled,false)
 }finally{await rm(folder,{recursive:true,force:true})}
})
