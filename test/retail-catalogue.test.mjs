import test from 'node:test'
import assert from 'node:assert/strict'
import { retailCatalogue } from '../server/retail-catalogue.mjs'
import { customerOrderLines } from '../cloud/customer-orders.mjs'
import { birthdayValue, birthdayCustomers } from '../server/customer-birthdays.mjs'
import { canRequest, operationPermission } from '../server/staff-permissions.mjs'

test('retail publication is explicit, omits private data and changes revision with price or tax',async()=>{
 const products=[{id:'rice',name:'Rice',price:10,cost:4,stock:50,unit:'bag'},{id:'private',name:'Paper',price:5},{id:'free',name:'Free',price:0}]
 const config={retailEnabled:true,retailProductIds:['rice','free']},menu=retailCatalogue(products,config,'tax1')
 assert.deepEqual(menu.items.map(item=>item.id),['rice']);assert.equal(menu.items[0].cost,undefined);assert.equal(menu.items[0].stock,undefined)
 assert.notEqual(menu.updatedAt,retailCatalogue([{...products[0],price:12}],config,'tax1').updatedAt)
 assert.notEqual(menu.updatedAt,retailCatalogue(products,config,'tax2').updatedAt)
 const lines=await customerOrderLines(menu,[{menuItemId:'rice',quantity:2,optionIds:[]}],false,async id=>products.find(row=>row.id===id))
 assert.equal(lines[0].productId,'rice');assert.equal(lines[0].price,10);assert.deepEqual(lines[0].ingredients,[])
 await assert.rejects(customerOrderLines(menu,[{menuItemId:'private',quantity:1}],false,async()=>products[1]),/no longer available/)
})
test('birthday reminders use business dates and valid month/day without storing age',()=>{
 assert.equal(birthdayValue('02-29'),'02-29');assert.equal(birthdayValue(''),'')
 for(const value of ['02-30','13-01','1-01','2020-01-01'])assert.throws(()=>birthdayValue(value))
 const customers=[{id:'a',birthday:'10-08',birthdayReminders:true},{id:'b',birthday:'10-08',birthdayReminders:false}]
 assert.deepEqual(birthdayCustomers(customers,new Date('2026-10-07T23:30:00Z'),'Africa/Lagos').map(row=>row.id),['a'])
 assert.deepEqual(birthdayCustomers(customers,new Date('2026-10-07T23:30:00Z'),'UTC'),[])
})
test('retail orders use product-selling grants for fulfilment, payment and sync',()=>{
 const staff={role:'cashier',permissions:{productSales:true}},sale={paymentDetails:{counterOrder:{retailOrder:true}}}
 assert.equal(canRequest(staff,'/api/pos/retail-orders/status','POST',{status:'ready'}),true)
 assert.equal(canRequest(staff,'/api/sales','POST',sale),true)
 assert.equal(canRequest({role:'cashier',permissions:{counter:true}},'/api/pos/retail-orders'),false)
 assert.equal(operationPermission({entityType:'pos_record',payload:{kind:'counter-order',retailOrder:true}}),'productSales')
})
