import test from 'node:test'
import assert from 'node:assert/strict'
import { measuredKilograms,weightLabel,weighingSettings } from '../server/weighed-goods.mjs'
const label=digits=>digits+((10-[...digits].reduce((n,d,i)=>n+Number(d)*(i%2?3:1),0)%10)%10)
test('scale readings preserve grams and reject unstable, negative, zero and unsupported precision',()=>{
 assert.equal(measuredKilograms('1.250 kg'),1.25);assert.equal(measuredKilograms('1250 g'),1.25);assert.equal(measuredKilograms('1250','g'),1.25)
 for(const value of ['-1 kg','0','US 1.2 kg','ST,GS,1.2','1.0001 kg','NaN','1e3','100001 kg'])assert.throws(()=>measuredKilograms(value))
})
test('EAN weight labels validate checksum, mapping, unit and nonzero grams; regular scans stay separate',()=>{
 const products=[{id:'rice',unit:'kg',price:10}],settings={labels:true,prefix:'20',codes:[{code:'12345',productId:'rice'}]}
 const code=label('201234501250');assert.equal(weightLabel(code,settings,products).quantity,1.25)
 assert.equal(weightLabel('9781234567897',settings,products),null);assert.equal(weightLabel(code,{},products),null)
 assert.throws(()=>weightLabel(code.slice(0,12)+(Number(code[12])+1)%10,settings,products),/checksum/)
 assert.throws(()=>weightLabel(label('201234500000'),settings,products),/positive/)
 assert.throws(()=>weightLabel(code,settings,[{id:'rice',unit:'piece'}]),/per kg/)
 assert.throws(()=>weightLabel(code,{...settings,codes:[]},products),/Map/)
 assert.throws(()=>weighingSettings({...settings,codes:[...settings.codes,...settings.codes]}),/distinct/)
})
