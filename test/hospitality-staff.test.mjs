import test from 'node:test'
import assert from 'node:assert/strict'
import { handleHospitality } from '../server/hospitality-operations.mjs'
import { handlePos } from '../server/pos-service.mjs'

const room={id:'hotel-room:one',kind:'hotel-room',branchId:'main',createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-02T00:00:00.000Z',status:'active',roomName:'Room 1',nightlyRate:100}
function fixture({activeStaff=true}={}){
 const queries=[]
 const db={query:async(sql,params=[])=>{queries.push(sql);if(sql.includes('FROM pos_records')&&sql.includes('WHERE scope=? AND id=?'))return {values:[{payload:JSON.stringify(room)}]};if(sql.includes('FROM pos_records'))return {values:[]};if(sql.includes('FROM users'))return {values:activeStaff?[{id:'current',name:'Current staff',role:'cashier',permissions:{hotelOperations:true},operationalAccess:true}]:[]};if(sql.includes('FROM branches'))return {values:[{assignedUserIds:'[]'}]};return {values:[]}}}
 return {db,queries}
}

test('hospitality staff lists and assignments exclude staff removed by Staff & access',async()=>{
 const listed=fixture()
 const data=await handleHospitality({db:listed.db,scope:'business',organizationId:'org',branchId:'main',user:{id:'owner',name:'Owner'},method:'GET',input:{}})
 assert.deepEqual(data.hotelStaff,[{id:'current',name:'Current staff'}])
 assert.deepEqual(data.nightlifeStaff,[])
 assert.ok(listed.queries.some(sql=>sql.includes('FROM staff_removals')))

 const removed=fixture({activeStaff:false})
 await assert.rejects(handleHospitality({db:removed.db,scope:'business',organizationId:'org',branchId:'main',user:{id:'owner',name:'Owner'},method:'POST',input:{action:'update-room',id:room.id,expectedUpdatedAt:room.updatedAt,status:'active',housekeepingStatus:'ready',housekeepingAssignedTo:'removed-staff',nightlyRate:100},publish:async()=>{},saveRecord:async()=>{}}),/active staff member/)
 assert.ok(removed.queries.some(sql=>sql.includes('FROM staff_removals')))
})

test('hotel-only staff cannot open or mutate nightlife operations',async()=>{
 const f=fixture()
 await assert.rejects(handleHospitality({db:f.db,scope:'business',organizationId:'org',branchId:'main',user:{id:'hotel-staff',name:'Hotel staff',role:'cashier',permissions:{hotelOperations:true}},method:'POST',input:{action:'create-event',name:'Friday',startsAt:'2099-01-01T20:00:00.000Z',capacity:10,admissionPrice:5},publish:async()=>{},saveRecord:async()=>{}}),/Nightlife operations access/)
})

test('hotel-only staff cannot create a nightlife admission invoice through the shared billing endpoint',async()=>{
 const db={run:async()=>{},query:async sql=>sql.includes('FROM pos_records WHERE scope=? AND id=?')?{values:[{payload:JSON.stringify({kind:'nightclub-entry'})}]}:{values:[]}}
 await assert.rejects(handlePos({db,scope:'business',branchId:'main',user:{id:'hotel-staff',name:'Hotel staff',role:'cashier',permissions:{hotelOperations:true,serviceJobs:true}},path:'/api/pos/hospitality/invoice',method:'POST',input:{hospitality:{recordId:'nightclub-entry:friday',recordKind:'nightclub-entry'}}}),/Nightlife operations access/)
})
