import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const zxing = require('@zxing/library')
const leftOdd = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
const leftEven = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
const right = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
const parity = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

function frameForEan13(value, moduleWidth) {
  const left = [...value.slice(1, 7)].map((digit, index) => (parity[Number(value[0])][index] === 'L' ? leftOdd : leftEven)[Number(digit)]).join('')
  const bits = `101${left}01010${[...value.slice(7)].map(digit => right[Number(digit)]).join('')}101`
  const width = 960, height = 120
  const start = Math.floor((width - bits.length * moduleWidth) / 2)
  const pixels = new Int32Array(width * height).fill(0xffffffff)
  for (let bit = 0; bit < bits.length; bit++) {
    if (bits[bit] !== '1') continue
    for (let x = 0; x < moduleWidth; x++) {
      for (let y = 0; y < height; y++) pixels[y * width + start + bit * moduleWidth + x] = 0xff000000
    }
  }
  return { pixels, width, height }
}

test('ZXing decodes clear EAN-13 camera frames, including the code shown in the iPhone photo', () => {
  for (const [barcode, expected] of [['0630902423791', '630902423791'], ['6974184075014', '6974184075014']]) {
    for (const moduleWidth of [2, 3, 4]) {
      const frame = frameForEan13(barcode, moduleWidth)
      const bitmap = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(frame.pixels, frame.width, frame.height)))
      const reader = new zxing.MultiFormatReader()
      reader.setHints(new Map([
        [zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.EAN_13, zxing.BarcodeFormat.UPC_A]],
        [zxing.DecodeHintType.TRY_HARDER, true],
      ]))
      assert.equal(reader.decode(bitmap).getText(), expected, `${barcode}, module width ${moduleWidth}`)
    }
  }
})
