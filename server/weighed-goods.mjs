export const kilogramUnit=unit=>['kg','kilogram','kilograms'].includes(String(unit).trim().toLowerCase())
export function measuredKilograms(raw,unit='kg') {
  const match=String(raw).trim().match(/^(\d+(?:\.\d+)?)\s*(kg|g)?$/i)
  if(!match||!['kg','g'].includes(unit))throw new Error('Use a positive reading such as 1.250 kg or 1250 g. Unstable, negative and protocol messages are not accepted.')
  const value=Number(match[1])/(String(match[2]||unit).toLowerCase()==='g'?1000:1)
  if(!Number.isFinite(value)||value<=0||value>100000||Math.abs(value*1000-Math.round(value*1000))>0.000001)throw new Error('Use a positive weight supported to the nearest gram (0.001 kg).')
  return Math.round(value*1000)/1000
}
export function weighingSettings(input={}) {
  const prefix=String(input.prefix||'20'),codes=input.codes||[]
  if(!/^2\d$/.test(prefix)||!Array.isArray(codes)||codes.length>200)throw new Error('Choose a label prefix from 20 to 29 and up to 200 product codes.')
  const seen=new Set()
  for(const row of codes){if(!/^\d{5}$/.test(row.code)||typeof row.productId!=='string'||!row.productId||seen.has(row.code))throw new Error('Use distinct five-digit scale product codes.');seen.add(row.code)}
  return {keyboard:input.keyboard===true,labels:input.labels===true,unit:input.unit==='g'?'g':'kg',prefix,codes:codes.map(row=>({code:row.code,productId:row.productId}))}
}
export function weightLabel(raw,settings,products) {
  const value=String(raw).trim(),config=weighingSettings(settings)
  if(!config.labels||!value.startsWith(config.prefix))return null
  if(!/^\d{13}$/.test(value))throw new Error('Weight labels require a complete 13-digit EAN barcode.')
  const sum=[...value.slice(0,12)].reduce((total,digit,index)=>total+Number(digit)*(index%2?3:1),0)
  if((10-sum%10)%10!==Number(value[12]))throw new Error('Weight label checksum is invalid. Scan the label again.')
  const code=value.slice(2,7),mapping=config.codes.find(row=>row.code===code),product=products.find(row=>row.id===mapping?.productId)
  if(!product||!kilogramUnit(product.unit))throw new Error('Map this scale code to an existing product stocked and priced per kg.')
  return {product,quantity:measuredKilograms(value.slice(7,12),'g'),barcode:value}
}
