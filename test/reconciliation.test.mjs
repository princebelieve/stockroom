import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = (await readFile(new URL('../src/lib/reconciliation.ts', import.meta.url), 'utf8')).replace(/import type[^\n]+/, '')
const { referenceFromScan, parseReport, compareReport } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

test('payment reference extraction preserves zeros and rejects ambiguous or arbitrary QR payloads', () => {
  assert.equal(referenceFromScan('001234'), '001234')
  assert.equal(referenceFromScan('{"reference":"001234"}'), '001234')
  assert.equal(referenceFromScan('https://example.test/receipt?reference=001234'), '001234')
  assert.throws(() => referenceFromScan('https://example.test/pay'), /identifiable/)
  assert.throws(() => referenceFromScan('{"reference":"one","rrn":"two"}'), /unambiguous/)
  assert.throws(() => referenceFromScan('amount=100;paid=true'), /Unrecognized/)
})

test('CSV parser handles quoted commas, escaped quotes and line breaks without losing references', () => {
  assert.deepEqual(parseReport('\uFEFFref,note\r\n001,"a,b"\r\n002,"a""b\nc"'), [['ref', 'note'], ['001', 'a,b'], ['002', 'a"b\nc']])
  assert.throws(() => parseReport('ref,amount\n001'), /same number/)
  assert.throws(() => parseReport('ref\n"open'), /unclosed/)
})

test('reconciliation matches provider, reference, successful status, currency and amount conservatively', () => {
  const mapping = { reference: 0, amount: 1, status: 2, currency: 3 }
  const sale = { id: 'sale-1', paymentMethod: 'external-pos', terminalProvider: 'OPay', paymentReference: '001', currency: 'NGN', total: 100 }
  const run = (rows, sales = [sale]) => compareReport(rows, mapping, 'opay', 'NGN', 'SUCCESS', sales)
  const row = ['001', '100.00', 'SUCCESS', 'NGN']
  assert.equal(run([row])[0].result, 'Matched')
  assert.match(run([row, row])[0].result, /Duplicate/)
  assert.match(run([row], [sale, { ...sale, id: 'sale-2' }])[0].result, /Duplicate/)
  assert.match(run([['001', '99', 'SUCCESS', 'NGN']])[0].result, /Amount mismatch/)
  assert.match(run([['001', '100', 'FAILED', 'NGN']])[0].result, /not the selected success/)
  assert.match(run([['001', '100', 'SUCCESS', 'USD']])[0].result, /Currency mismatch/)
  assert.match(run([row], [{ ...sale, currency: undefined }])[0].result, /unavailable/)
  assert.match(run([row], [{ ...sale, terminalProvider: 'Other' }])[0].result, /No matching/)
  assert.match(run([['001', '1,000.00', 'SUCCESS', 'NGN']])[0].result, /Invalid/)
  assert.equal(sale.total, 100)
})

test('transfer and split reconciliation uses payment portions, flags missing references and does not treat failures as matches',()=>{
 const sales=[{id:'split',paymentMethod:'multiple',currency:'NGN',total:100,paymentDetails:{allocations:[{method:'cash',amount:30},{method:'bank-transfer',amount:70,reference:'transfer'}]}},{id:'missing',paymentMethod:'bank-transfer',currency:'NGN',total:20,paymentReference:'later'},{id:'no-ref',paymentMethod:'bank-transfer',currency:'NGN',total:5}]
 const rows=[['transfer','70','SUCCESS','NGN']],mapping={reference:0,amount:1,status:2,currency:3}
 const results=compareReport(rows,mapping,'','NGN','SUCCESS',sales,'bank-transfer',true)
 assert.equal(results[0].result,'Matched');assert.equal(results[0].saleId,'split')
 assert.equal(results[1].result,'Recorded payment absent from report');assert.equal(results[2].result,'Recorded payment has no reference')
 assert.match(compareReport([['transfer','100','SUCCESS','NGN']],mapping,'','NGN','SUCCESS',sales,'bank-transfer')[0].result,/Amount mismatch/)
 assert.match(compareReport([['transfer','70','FAILED','NGN']],mapping,'','NGN','SUCCESS',sales,'bank-transfer')[0].result,/not the selected success/)
 assert.equal(sales[0].total,100)
})
