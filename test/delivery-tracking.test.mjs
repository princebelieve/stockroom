import test from 'node:test'
import assert from 'node:assert/strict'
import { deliveryProgress, validateDeliveryTracking } from '../server/delivery-tracking.mjs'
import { customerHandoff, customerOrderSettings } from '../server/customer-order-settings.mjs'

const at = '2026-10-07T12:00:00.000Z'
test('delivery areas use owner prices and reject unserved areas', () => {
  const config = { deliveryEnabled: true, deliveryFee: 100, deliveryZones: [{id:'lagos',name:'Lagos',fee:2500}] }
  const input = { diningOption:'Delivery', delivery:{phone:'08012345678',address:'12 Market Street, Lagos',zoneId:'lagos',fee:1} }
  assert.equal(customerHandoff(config,input).delivery.fee,2500)
  assert.equal(customerHandoff(config,input).delivery.zoneName,'Lagos')
  assert.throws(()=>customerHandoff(config,{...input,delivery:{...input.delivery,zoneId:'unknown'}}),/area/)
  assert.deepEqual(customerOrderSettings({...config,deliveryZones:[...config.deliveryZones,...config.deliveryZones,{id:'bad',name:'Bad',fee:-1}]}).deliveryZones,config.deliveryZones)
})
test('assignment, dispatch and completion preserve agent history and reject shortcuts', () => {
  const order = {status:'ready',delivery:{address:'12 Market Street',phone:'08012345678'},expectedUpdatedAt:'old',updatedAt:at}
  const assigned = {...order,action:'delivery',deliveryAction:'assign',deliveryTracking:deliveryProgress(order,{deliveryAction:'assign',courierName:'Ada',courierPhone:'08012345678'},at)}
  validateDeliveryTracking(assigned,order)
  assert.throws(()=>validateDeliveryTracking({...assigned,action:'status'},order),/delivery action/)
  assert.throws(()=>validateDeliveryTracking({...order,status:'collected'},order),/Assign and dispatch/)
  assert.throws(()=>validateDeliveryTracking({...assigned,status:'collected',action:'status'},assigned),/Dispatch/)
  assert.throws(()=>deliveryProgress({...assigned,status:'preparing'},{deliveryAction:'dispatch'},at),/ready/)
  const dispatched={...assigned,deliveryAction:'dispatch',deliveryTracking:deliveryProgress(assigned,{deliveryAction:'dispatch'},at)}
  validateDeliveryTracking(dispatched,assigned)
  assert.throws(()=>deliveryProgress(dispatched,{deliveryAction:'assign',courierName:'Other',courierPhone:'08098765432'},at),/reassigned/)
  validateDeliveryTracking({...dispatched,status:'collected',action:'status',deliveryTracking:{...dispatched.deliveryTracking,status:'delivered',deliveredAt:at}},dispatched)
  assert.throws(()=>validateDeliveryTracking({...dispatched,deliveryTracking:{...dispatched.deliveryTracking,courierName:'Other'},action:'status'},dispatched),/delivery action/)
})
