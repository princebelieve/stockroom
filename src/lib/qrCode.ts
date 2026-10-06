const blockSpecs = [null, [1, 19, 7], [1, 34, 10], [1, 55, 15], [1, 80, 20], [1, 108, 26], [2, 68, 18], [2, 78, 20], [2, 97, 24]] as const
const centers: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42]]

function multiply(a: number, b: number) {
  let result = 0
  for (let i = 7; i >= 0; i--) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d)
    result ^= ((b >>> i) & 1) * a
  }
  return result
}
function polynomialMultiply(a: number[], b: number[]) {
  const result = Array(a.length + b.length - 1).fill(0)
  a.forEach((x, i) => b.forEach((y, j) => { result[i + j] ^= multiply(x, y) }))
  return result
}
function rsRemainder(data: number[], degree: number) {
  let generator = [1]
  let root = 1
  for (let i = 0; i < degree; i++) { generator = polynomialMultiply(generator, [1, root]); root = multiply(root, 2) }
  const work = [...data, ...Array(degree).fill(0)]
  for (let i = 0; i < data.length; i++) { const factor = work[i]; if (factor) for (let j = 0; j < generator.length; j++) work[i + j] ^= multiply(generator[j], factor) }
  return work.slice(data.length)
}

export function qrMatrix(value: string): boolean[][] {
  const bytes = [...new TextEncoder().encode(value)]
  const version = [1, 2, 3, 4, 5, 6, 7, 8].find(v => { const [blocks, blockData] = blockSpecs[v]!; return bytes.length <= (blocks * blockData * 8 - 12) / 8 })
  if (!version) throw new Error('This link is too long for the customer QR code.')
  const bits: number[] = []
  const append = (number: number, length: number) => { for (let i = length - 1; i >= 0; i--) bits.push((number >>> i) & 1) }
  append(4, 4); append(bytes.length, 8); bytes.forEach(byte => append(byte, 8))
  const [blockCount, blockData] = blockSpecs[version]!
  const totalDataCodewords = blockCount * blockData
  for (let i = 0, n = Math.min(4, totalDataCodewords * 8 - bits.length); i < n; i++) bits.push(0)
  while (bits.length % 8) bits.push(0)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((n, bit) => n * 2 + bit, 0))
  for (let pad = 0; data.length < totalDataCodewords; pad++) data.push(pad % 2 ? 0x11 : 0xec)
  const dataBlocks = Array.from({ length: blockCount }, (_, index) => data.slice(index * blockData, (index + 1) * blockData))
  const eccBlocks = dataBlocks.map(block => rsRemainder(block, blockSpecs[version]![2]))
  const codewords: number[] = []
  for (let i = 0; i < blockData; i++) for (const block of dataBlocks) codewords.push(block[i])
  for (let i = 0; i < blockSpecs[version]![2]; i++) for (const block of eccBlocks) codewords.push(block[i])
  const size = 17 + 4 * version
  const matrix = Array.from({ length: size }, () => Array(size).fill(false)) as boolean[][]
  const reserved = Array.from({ length: size }, () => Array(size).fill(false)) as boolean[][]
  const set = (row: number, column: number, dark: boolean) => { if (row >= 0 && row < size && column >= 0 && column < size) { matrix[row][column] = dark; reserved[row][column] = true } }
  for (const [row, column] of [[3, 3], [3, size - 4], [size - 4, 3]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      set(row + dy, column + dx, distance !== 2 && distance !== 4)
    }
  }
  for (const row of centers[version]) for (const column of centers[version]) {
    if (reserved[row]?.[column]) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(row + dy, column + dx, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const formatData = (1 << 3) // Error correction level L, mask pattern 0.
  let remainder = formatData
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
  const format = ((formatData << 10) | remainder) ^ 0x5412
  const formatBit = (i: number) => ((format >>> i) & 1) !== 0
  for (let i = 0; i <= 5; i++) set(i, 8, formatBit(i))
  set(7, 8, formatBit(6)); set(8, 8, formatBit(7)); set(8, 7, formatBit(8))
  for (let i = 9; i < 15; i++) set(8, 14 - i, formatBit(i))
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, formatBit(i))
  for (let i = 8; i < 15; i++) set(size - 15 + i, 8, formatBit(i))
  set(size - 8, 8, true)
  if (version >= 7) {
    let versionRemainder = version
    for (let i = 0; i < 12; i++) versionRemainder = (versionRemainder << 1) ^ ((versionRemainder >>> 11) * 0x1f25)
    const versionBits = (version << 12) | versionRemainder
    for (let i = 0; i < 18; i++) { const dark = ((versionBits >>> i) & 1) !== 0; const a = size - 11 + i % 3, b = Math.floor(i / 3); set(b, a, dark); set(a, b, dark) }
  }
  let bitIndex = 0, upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      const row = upward ? size - 1 - vert : vert
      for (let offset = 0; offset < 2; offset++) {
        const column = right - offset
        if (reserved[row][column]) continue
        const bit = bitIndex < codewords.length * 8 ? ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0 : false
        matrix[row][column] = bit !== ((row + column) % 2 === 0)
        bitIndex++
      }
    }
    upward = !upward
  }
  return matrix
}
