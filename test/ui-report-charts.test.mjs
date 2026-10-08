import test from 'node:test'
import assert from 'node:assert/strict'
import {buildReports} from '../server/reports.mjs'
import {normalizeShopProfile,validateShopProfile,applyBusinessPreset} from '../server/shop-profile.mjs'

test('charts reconcile monthly net sales and retain split receipts as a distinct method',()=>{
 const data={reportingTimeZone:'Africa/Lagos',sales:[{id:'one',createdAt:'2026-09-30T23:30:00Z',total:100,paymentMethod:'multiple'},{id:'two',createdAt:'2026-10-02T10:00:00Z',total:50,paymentMethod:'cash'},{id:'old',createdAt:'2026-09-01T10:00:00Z',total:999,paymentMethod:'cash'}],items:[{saleId:'one',productId:'rice',productName:'Rice',quantity:3,unitCost:5}],products:[],expenses:[{category:'Rent',amount:20,incurredAt:'2026-10-01'}],returns:[{saleId:'one',updatedAt:'2026-10-02T11:00:00Z',total:10,items:[{lineIndex:0,quantity:1,restock:false}]}]}
 const report=buildReports(data,new Date('2026-10-03T12:00:00Z'))
 assert.equal(report.charts.daily.reduce((sum,row)=>sum+row.value,0),report.monthly.total)
 assert.equal(report.charts.daily[0].label,'2026-10-01')
 assert.deepEqual(report.charts.payments,[{label:'Split payment',value:100},{label:'Cash',value:50}])
 assert.deepEqual(report.charts.products,[{label:'Rice',value:2}])
 assert.deepEqual(report.charts.expenses,[{label:'Rent',value:20}])
})
test('owner brand choices survive normalization and workspace changes',()=>{
 const profile=validateShopProfile({...normalizeShopProfile(),brandColor:'#A43B72'})
 assert.equal(profile.brandColor,'#a43b72')
 assert.equal(applyBusinessPreset(profile,'bar').brandColor,'#a43b72')
 assert.equal(normalizeShopProfile({brandColor:'url(untrusted)'}).brandColor,'')
 assert.throws(()=>validateShopProfile({...profile,brandColor:'red'}),/brand colour/)
})
