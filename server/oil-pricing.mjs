export function oilPricing(value={}) {
  const money=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&Number.isSafeInteger(Math.round(n*100))&&Math.abs(n*100-Math.round(n*100))<0.000001
  const bulk=value.bulk||[],customers=value.customers||[]
  if(!Array.isArray(bulk)||!Array.isArray(customers)||bulk.length>30||customers.length>200)throw new Error('Use up to 30 bulk thresholds and 200 customer rates.')
  const seen=new Set()
  for(const row of bulk){if(typeof row.minimum!=='number'||!Number.isFinite(row.minimum)||row.minimum<=0||!Number.isSafeInteger(Math.round(row.minimum*1000))||Math.abs(row.minimum*1000-Math.round(row.minimum*1000))>0.000001||!money(row.price)||seen.has(row.minimum))throw new Error('Enter distinct positive bulk quantities and prices with up to two decimals.');seen.add(row.minimum)}
  seen.clear()
  for(const row of customers){if(typeof row.customerId!=='string'||!row.customerId||row.customerId.length>150||!money(row.price)||seen.has(row.customerId))throw new Error('Choose distinct customers and valid customer prices.');seen.add(row.customerId)}
  return {bulk:bulk.map(row=>({minimum:row.minimum,price:row.price})).sort((a,b)=>a.minimum-b.minimum),customers:customers.map(row=>({customerId:row.customerId,price:row.price}))}
}
export function oilPrice(product,rules,baseQuantity,customerId='') {
  const value=oilPricing(rules),customer=value.customers.find(row=>row.customerId===customerId)
  const bulk=value.bulk.filter(row=>Math.round(baseQuantity*1000)>=Math.round(row.minimum*1000)).at(-1)
  const rate=customer||bulk
  return rate?{price:Math.round(rate.price*(product.saleFactor||1)*100)/100,label:customer?'Customer rate':'Bulk rate'}:{price:product.price,label:'Retail price'}
}
