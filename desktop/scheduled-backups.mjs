import { readFile, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { encryptBackup } from '../server/business-backup.mjs'
export function createScheduledBackups({ configPath, chooseDirectory, encryptSecret, decryptSecret, snapshot }) {
  let running=false
  async function load() { try { return JSON.parse(await readFile(configPath,'utf8')) } catch { return { enabled:false } } }
  async function save(config) { const temporary=configPath+'.tmp';await writeFile(temporary,JSON.stringify(config),{mode:0o600});await rename(temporary,configPath) }
  async function status() { const config=await load();const { secret,...publicConfig }=config;return publicConfig }
  async function run(force=false) {
    if(running)return;running=true
    try {
      const config=await load();if(!config.enabled || (!force&&config.lastAt&&Date.now()-Date.parse(config.lastAt)<86400000))return
      try {
        const data=await snapshot(config.tillId)
        if(data.businessId!==config.businessId)throw new Error('Backup business changed. Configure scheduled backups again.')
        const archive=encryptBackup(data,decryptSecret(Buffer.from(config.secret,'base64')))
        const fileName=`stockroom-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.json`
        // The directory comes only from the owner's native folder picker.
        await writeFile(join(config.directory,fileName),JSON.stringify(archive),{flag:'wx',mode:0o600})
        await save({...config,lastAt:new Date().toISOString(),lastError:''})
      } catch(error) { await save({...config,lastError:error.message}) }
    }finally{running=false}
    return status()
  }
  async function configure({ password,tillId }) {
    const data=await snapshot(tillId);encryptBackup(data,password)
    const directory=await chooseDirectory();if(!directory)return status()
    await save({enabled:true,directory,tillId,businessId:data.businessId,secret:encryptSecret(password).toString('base64')})
    await run(true);return status()
  }
  async function disable(){const config=await load();await save({...config,enabled:false,secret:undefined});return status()}
  let chain=Promise.resolve()
  const serialize=work=>{const next=chain.catch(()=>{}).then(work);chain=next;return next}
  return {status,configure:input=>serialize(()=>configure(input)),disable:()=>serialize(disable),run:force=>serialize(()=>run(force))}
}
