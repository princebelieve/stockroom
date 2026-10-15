import { BrowserMultiFormatReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'

const leftOdd = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011']
const leftEven = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111']
const right = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100']
const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL']

/** Exercise ZXing's actual video-element loop using a moving browser video stream. */
export async function scanRotatedBarcodeFromVideo() {
  const value = '4006381333931'
  const first = Number(value[0])
  const left = [...value.slice(1, 7)].map((digit, index) => (parity[first][index] === 'L' ? leftOdd : leftEven)[Number(digit)]).join('')
  const bits = `101${left}01010${[...value.slice(7)].map(digit => right[Number(digit)]).join('')}101`
  const canvas = document.createElement('canvas')
  canvas.width = 800
  canvas.height = 320
  const context = canvas.getContext('2d')!
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.translate(canvas.width / 2, canvas.height / 2)
  context.rotate(12 * Math.PI / 180)
  context.translate(-canvas.width / 2, -canvas.height / 2)
  context.fillStyle = 'black'
  const module = 4
  const start = (canvas.width - bits.length * module) / 2
  for (let index = 0; index < bits.length; index++) if (bits[index] === '1') context.fillRect(start + index * module, 55, module, 210)
  context.restore()

  const stream = canvas.captureStream(15)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = stream
  await video.play()
  const reader = new BrowserMultiFormatReader(new Map([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A]],
    [DecodeHintType.TRY_HARDER, true],
  ]), { delayBetweenScanAttempts: 120, delayBetweenScanSuccess: 250, tryPlayVideoTimeout: 5000 })
  let controls: { stop: () => void } | undefined
  try {
    const result = await Promise.race([
      new Promise<string>((resolve, reject) => {
        void reader.decodeFromVideoElement(video, decoded => { if (decoded) resolve(decoded.getText()) }).then(value => { controls = value })
        window.setTimeout(() => reject(new Error('No barcode was detected in the live video stream.')), 5000)
      }),
    ])
    return result
  } finally {
    controls?.stop()
    stream.getTracks().forEach(track => track.stop())
    video.srcObject = null
  }
}
