import test from 'node:test'
import assert from 'node:assert/strict'
import {copyMenuItems,menuCopyCandidates} from '../server/menu-copy.mjs'
const source={id:'counter-menu',items:[{id:'rice',name:'Rice',price:20,type:'prepared',available:true,recipe:[{productId:'grain',quantity:0.2}],options:[{id:'extra',name:'Extra sauce',price:3,recipe:[{productId:'sauce',quantity:0.05}]}]}]}
test('menu copy preserves prices, extras, ingredient quantities and source snapshots with fresh identities',()=>{
 const original=structuredClone(source);let n=0
 const copies=copyMenuItems(source,[],['rice'],true,()=>String(++n))
 assert.equal(copies[0].station,'kitchen');assert.equal(copies[0].price,20);assert.equal(copies[0].id,'1');assert.equal(copies[0].options[0].id,'2')
 assert.deepEqual(copies[0].recipe,source.items[0].recipe);assert.deepEqual(copies[0].options[0].recipe,source.items[0].options[0].recipe)
 copies[0].recipe[0].quantity=9;copies[0].options[0].price=7
 assert.deepEqual(source,original)
 assert.throws(()=>copyMenuItems(source,copies,['rice'],true),/already/)
 assert.equal(menuCopyCandidates(source,[{...copies[0],name:'Renamed rice'}])[0].exists,true)
 assert.throws(()=>copyMenuItems(source,[{...source.items[0],id:'other',name:' RICE '}],['rice'],true),/already/)
})
test('copy back removes station only, retains stock link and protects destination capacity',()=>{
 const restaurant={id:'restaurant-menu',items:[{id:'bottle',name:'Cola',price:5,type:'stock',productId:'cola',available:false,station:'bar',options:[]}]}
 const result=copyMenuItems(restaurant,[],['bottle'],false)
 assert.equal(result[0].station,undefined);assert.equal(result[0].productId,'cola');assert.equal(result[0].available,false)
 assert.throws(()=>copyMenuItems(source,Array.from({length:200},(_,i)=>({id:String(i),name:String(i)})),['rice'],true),/200/)
 assert.throws(()=>copyMenuItems(source,[],['missing'],true),/no longer/)
})
