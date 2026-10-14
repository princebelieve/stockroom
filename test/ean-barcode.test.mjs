import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const source = (await readFile(new URL('../src/lib/eanBarcode.ts', import.meta.url), 'utf8'))
  .replace("import { validGtin } from './productIntake'", `function validGtin(value) {
    if (!/^(?:\\d{8}|\\d{12}|\\d{13}|\\d{14})$/.test(value)) return false
    const digits = [...value].map(Number)
    const check = digits.pop()
    return (10 - digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 ? 1 : 3), 0) % 10) % 10 === check
  }`)
const decoder = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)

const leftOdd = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
const right = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']

function ean13Bits(value) {
  assert.equal(value[0], '0', 'test encoding uses the all-L left digit pattern')
  return `101${[...value.slice(1, 7)].map(digit => leftOdd[Number(digit)]).join('')}01010${[...value.slice(7)].map(digit => right[Number(digit)]).join('')}101`
}

function frameForBarcode(value, moduleWidth) {
  const width = 960
  const bits = ean13Bits(value)
  const start = Math.floor((width - bits.length * moduleWidth) / 2)
  const data = new Uint8ClampedArray(width * 4).fill(255)
  for (let index = 0; index < bits.length; index++) {
    if (bits[index] !== '1') continue
    for (let pixel = 0; pixel < moduleWidth; pixel++) {
      const offset = (start + index * moduleWidth + pixel) * 4
      data[offset] = data[offset + 1] = data[offset + 2] = 0
    }
  }
  const context = { drawImage() {}, getImageData: () => ({ data }) }
  return { video: { videoWidth: width, videoHeight: 100 }, canvas: { getContext: () => context } }
}

test('EAN-13 camera frame decoding handles bars wider than one pixel', () => {
  for (const moduleWidth of [2, 3, 4]) {
    const { video, canvas } = frameForBarcode('0630902423791', moduleWidth)
    assert.equal(decoder.decodeEanFrame(video, canvas), '0630902423791', `module width ${moduleWidth}`)
  }
})
