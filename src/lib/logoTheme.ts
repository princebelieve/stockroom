const themeProperties = ['--ink', '--mint', '--lime', '--brand-hover', '--brand-accent'] as const

function resetTheme() {
  for (const property of themeProperties) document.documentElement.style.removeProperty(property)
  document.documentElement.removeAttribute('data-logo-theme')
}

function rgbToHsl(red: number, green: number, blue: number) {
  const r = red / 255; const g = green / 255; const b = blue / 255
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const delta = max - min
  let hue = 0
  if (delta) hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  hue = Math.round((hue * 60 + 360) % 360)
  const lightness = (max + min) / 2
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0
  return { hue, saturation: Math.round(saturation * 100), lightness: Math.round(lightness * 100) }
}

async function dominantLogoColor(source: string) {
  const image = new Image()
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Logo could not be read.')); image.src = source })
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 40
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas is unavailable.')
  context.drawImage(image, 0, 0, 40, 40)
  const data = context.getImageData(0, 0, 40, 40).data
  const buckets = new Map<string, { red: number; green: number; blue: number; count: number; score: number }>()
  for (let index = 0; index < data.length; index += 4) {
    const [red, green, blue, alpha] = [data[index], data[index + 1], data[index + 2], data[index + 3]]
    const { saturation, lightness } = rgbToHsl(red, green, blue)
    if (alpha < 160 || saturation < 24 || lightness < 12 || lightness > 86) continue
    const key = `${Math.round(red / 32)}-${Math.round(green / 32)}-${Math.round(blue / 32)}`
    const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0, score: 0 }
    bucket.red += red; bucket.green += green; bucket.blue += blue; bucket.count += 1; bucket.score += saturation * (1 - Math.abs(lightness - 50) / 100)
    buckets.set(key, bucket)
  }
  const best = [...buckets.values()].sort((left, right) => right.score - left.score)[0]
  if (!best?.score) throw new Error('Logo has no usable accent color.')
  return rgbToHsl(best.red / best.count, best.green / best.count, best.blue / best.count)
}

export async function applyLogoTheme(logoData: string) {
  resetTheme()
  if (!logoData) return
  try {
    const { hue, saturation } = await dominantLogoColor(logoData)
    const vividness = Math.max(42, Math.min(78, saturation))
    const root = document.documentElement
    root.style.setProperty('--ink', `hsl(${hue} ${Math.min(52, vividness)}% 20%)`)
    root.style.setProperty('--brand-hover', `hsl(${hue} ${Math.min(58, vividness)}% 29%)`)
    root.style.setProperty('--brand-accent', `hsl(${hue} ${vividness}% 62%)`)
    root.style.setProperty('--mint', `hsl(${hue} ${Math.min(48, vividness)}% 91%)`)
    root.style.setProperty('--lime', `hsl(${hue} ${Math.min(65, vividness)}% 72%)`)
    root.dataset.logoTheme = 'active'
  } catch {
    resetTheme()
  }
}
