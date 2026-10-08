const labels={appName:'Business name',currency:'Currency',posProvider:'POS provider',posTerminalId:'Terminal',posConnection:'Terminal connection',logoData:'Business logo',shopProfile:'Workspace',paymentPolicy:'Payment settings',features:'Enabled functions',workflows:'Sales workflow',fastFood:'Order counter',restaurant:'Tables and tabs',productSales:'Product sales',services:'Services',brandColor:'Brand colour',reportingTimeZone:'Time zone',customerOrdering:'Online orders',allowWallet:'Customer wallet payments',providers:'Payment providers',retailEnabled:'Online product orders',retailProductIds:'Published products'}
const metadata=new Set(['updatedAt','updated','createdAt','receivedAt','expectedUpdatedAt'])
const privateField=key=>/password|token|secret|mongoUri/i.test(key)
function parse(value){try{const result=typeof value==='string'?JSON.parse(value):value;return result&&typeof result==='object'&&!Array.isArray(result)?result:null}catch{return null}}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>!metadata.has(key)).map(key=>[key,canonical(value[key])]));return value}
function caption(key){return labels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/^./,letter=>letter.toUpperCase())}
function readable(value,key){if(privateField(key))return 'Private setting';if(key==='logoData')return value?'Logo saved':'No logo';if(value===undefined||value===null||value==='')return 'Not set';if(typeof value==='boolean')return value?'Enabled':'Disabled';if(Array.isArray(value))return value.every(item=>['string','number'].includes(typeof item))?value.map(item=>String(item).slice(0,100)).join(', ').slice(0,300)||'None':`${value.length} entries`;if(typeof value==='object')return 'Saved details';const text=String(value);return /data:|base64,/i.test(text)?'Saved attachment':text.slice(0,300)}
export function syncComparison(localRaw,remoteRaw){
  const local=parse(localRaw),remote=parse(remoteRaw)
  if(!local||!remote)return {available:false,matching:false,rows:[]}
  const rows=[]
  function visit(left,right,path=[]){
    for(const key of new Set([...Object.keys(left||{}),...Object.keys(right||{})])){
      if(metadata.has(key))continue
      const a=left?.[key],b=right?.[key],name=[...path,caption(key)]
      if(JSON.stringify(canonical(a))===JSON.stringify(canonical(b)))continue
      if(!privateField(key)&&a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b))visit(a,b,name)
      else rows.push({label:name.join(' · '),local:readable(a,key),remote:readable(b,key),logo:key==='logoData',localLogo:key==='logoData'&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(a||'')?a:'',remoteLogo:key==='logoData'&&/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(b||'')?b:''})
    }
  }
  visit(local,remote)
  return {available:true,matching:JSON.stringify(canonical(local))===JSON.stringify(canonical(remote)),rows}
}
