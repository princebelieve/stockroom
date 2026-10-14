import { validGtin } from './productIntake'

const leftOdd = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']
const leftEven = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']
const right = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']
const ean13Parity = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL']

function checksumValid(value: string) { return validGtin(value) }

function digit(bits: string, patterns: string[]) { return patterns.indexOf(bits) }

function decodeBits(bits: string) {
  if (bits.length === 95 && bits.startsWith('101') && bits.slice(45, 50) === '01010' && bits.endsWith('101')) {
    let leftDigits = ''
    let parity = ''
    for (let index = 0; index < 6; index++) {
      const value = bits.slice(3 + index * 7, 10 + index * 7)
      const odd = digit(value, leftOdd)
      if (odd >= 0) { leftDigits += odd; parity += 'L'; continue }
      const even = digit(value, leftEven)
      if (even < 0) return ''
      leftDigits += even; parity += 'G'
    }
    let rightDigits = ''
    for (let index = 0; index < 6; index++) {
      const value = digit(bits.slice(50 + index * 7, 57 + index * 7), right)
      if (value < 0) return ''
      rightDigits += value
    }
    const first = ean13Parity.indexOf(parity)
    const code = `${first}${leftDigits}${rightDigits}`
    return first >= 0 && checksumValid(code) ? code : ''
  }
  if (bits.length === 67 && bits.startsWith('101') && bits.slice(31, 36) === '01010' && bits.endsWith('101')) {
    let value = ''
    for (let index = 0; index < 4; index++) {
      const digit = leftOdd.indexOf(bits.slice(3 + index * 7, 10 + index * 7))
      if (digit < 0) return ''
      value += digit
    }
    for (let index = 0; index < 4; index++) {
      const digit = right.indexOf(bits.slice(36 + index * 7, 43 + index * 7))
      if (digit < 0) return ''
      value += digit
    }
    return checksumValid(value) ? value : ''
  }
  return ''
}

function decodeLine(data: Uint8ClampedArray, width: number, y: number) {
  const luminance = new Uint8Array(width)
  let min = 255, max = 0
  for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    const gray = Math.round((data[offset] * 299 + data[offset + 1] * 587 + data[offset + 2] * 114) / 1000)
    luminance[x] = gray
    min = Math.min(min, gray); max = Math.max(max, gray)
  }
  if (max - min < 35) return ''
  const threshold = (min + max) / 2
  const bits = Array.from(luminance, value => value < threshold ? '1' : '0').join('')
  // The quiet zone may be partly outside the preview. Locate likely start
  // guards and estimate one module from their first three alternating runs.
  for (let at = 0; at < width - 95 * 1.1; at++) {
    if (bits.slice(at, at + 3) !== '101') continue
    let runEnd = at + 1
    while (runEnd < width && bits[runEnd] === bits[at]) runEnd++
    const module = (runEnd - at) // first guard run is one module
    if (module < 1 || module > width / 67) continue
    for (const scale of [0.96, 1, 1.04]) {
      const unit = module * scale
      for (const offset of [-0.2, 0, 0.2]) {
        for (const length of [95, 67]) {
          let sampled = ''
          for (let i = 0; i < length; i++) sampled += bits[Math.round(at + (i + 0.5 + offset) * unit)] || '0'
          const result = decodeBits(sampled)
          if (result) return result
        }
      }
    }
  }
  return ''
}

/** Decode common retail EAN-13/UPC-A and EAN-8 labels from a camera frame. */
export function decodeEanFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  if (!video.videoWidth || !video.videoHeight) return ''
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return ''
  const width = Math.min(video.videoWidth, 960)
  const height = Math.max(1, Math.round(video.videoHeight * width / video.videoWidth))
  canvas.width = width; canvas.height = height
  context.drawImage(video, 0, 0, width, height)
  const rows = [0.35, 0.42, 0.49, 0.56, 0.63, 0.70].map(fraction => Math.floor(height * fraction))
  for (const y of rows) {
    const decoded = decodeLine(context.getImageData(0, y, width, 1).data, width, 0)
    if (decoded) return decoded
  }
  return ''
}
