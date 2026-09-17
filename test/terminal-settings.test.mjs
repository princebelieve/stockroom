import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = stripTypeScriptTypes(await readFile(new URL('../src/lib/terminalSettings.ts', import.meta.url), 'utf8'))
const { readTerminalSettings, saveTerminalSettings, canRecordTerminalPayment } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('terminal profiles isolate businesses and only persist declared non-secret fields', () => {
  const values = new Map()
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  try {
    saveTerminalSettings('business-a', { ...readTerminalSettings('business-a'), provider: 'OPay', terminalId: 'POS-1', secretKey: 'must-not-persist' })
    assert.equal(readTerminalSettings('business-a').terminalId, 'POS-1')
    assert.equal(readTerminalSettings('business-b').terminalId, '')
    assert.ok(!values.get('stockroom-terminal:business-a').includes('must-not-persist'))
    const unavailable = { ...readTerminalSettings('business-a'), connection: 'sdk', manualFallback: false }
    assert.equal(canRecordTerminalPayment(unavailable), false)
    assert.equal(canRecordTerminalPayment({ ...unavailable, manualFallback: true }), true)
    assert.throws(() => saveTerminalSettings('business-a', { ...unavailable, port: '65536' }), /Port/)
    assert.throws(() => saveTerminalSettings('business-a', { ...unavailable, host: 'https://user:password@terminal/' }), /hostname/)
    assert.equal(readTerminalSettings('business-a').connection, 'manual')
    values.set('stockroom-terminal:business-a', '{invalid')
    assert.equal(readTerminalSettings('business-a').provider, '')
  } finally { delete globalThis.localStorage }
})
