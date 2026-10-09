const themeProperties = ['--ink', '--mint', '--lime', '--brand-hover', '--brand-accent', '--brand-primary', '--brand-secondary', '--brand-dark', '--brand-on-primary', '--brand-on-hover', '--brand-wash', '--brand-wash-alt'] as const

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

function hslToRgb(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100; const l = lightness / 100
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const segment = hue / 60
  const x = chroma * (1 - Math.abs(segment % 2 - 1))
  const [red, green, blue] = segment < 1 ? [chroma, x, 0] : segment < 2 ? [x, chroma, 0] : segment < 3 ? [0, chroma, x] : segment < 4 ? [0, x, chroma] : segment < 5 ? [x, 0, chroma] : [chroma, 0, x]
  const offset = l - chroma / 2
  return [red, green, blue].map(channel => channel + offset)
}

function luminance(channels: number[]) {
  const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
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

let themeRevision = 0
export async function applyLogoTheme(logoData: string, brandColor = '') {
  const revision = ++themeRevision
  resetTheme()
  if (!logoData && !brandColor) return
  try {
    const hasExplicitBrandColor = /^#[a-f0-9]{6}$/i.test(brandColor)
    const { hue, saturation, lightness } = hasExplicitBrandColor ? rgbToHsl(parseInt(brandColor.slice(1,3),16),parseInt(brandColor.slice(3,5),16),parseInt(brandColor.slice(5,7),16)) : await dominantLogoColor(logoData)
    if (revision !== themeRevision) return
    const vividness = saturation < 18 ? saturation : Math.max(58, Math.min(88, saturation))
    const brandLightness = Math.max(42, Math.min(54, lightness))
    const hoverLightness = Math.max(36, brandLightness - 6)
    const brandRgb = hslToRgb(hue, vividness, brandLightness)
    const brandLuminance = luminance(brandRgb)
    const whiteContrast = 1.05 / (brandLuminance + 0.05)
    const darkContrast = (brandLuminance + 0.05) / (luminance([23 / 255, 53 / 255, 45 / 255]) + 0.05)
    const hoverLuminance = luminance(hslToRgb(hue, vividness, hoverLightness))
    const whiteHoverContrast = 1.05 / (hoverLuminance + 0.05)
    const darkHoverContrast = (hoverLuminance + 0.05) / (luminance([23 / 255, 53 / 255, 45 / 255]) + 0.05)
    const root = document.documentElement
    root.style.setProperty('--brand-primary', `hsl(${hue} ${vividness}% ${brandLightness}%)`)
    root.style.setProperty('--brand-secondary', `hsl(${(hue+150)%360} ${Math.max(54, Math.min(76, vividness))}% 50%)`)
    root.style.setProperty('--brand-dark', `hsl(${hue} ${Math.min(58, vividness)}% 21%)`)
    root.style.setProperty('--brand-wash', `hsl(${hue} ${Math.min(34, vividness)}% 96%)`)
    root.style.setProperty('--brand-wash-alt', `hsl(${(hue+150)%360} 24% 97%)`)
    root.style.setProperty('--brand-on-primary', whiteContrast >= darkContrast ? '#ffffff' : '#17352d')
    root.style.setProperty('--brand-on-hover', whiteHoverContrast >= darkHoverContrast ? '#ffffff' : '#17352d')
    root.style.setProperty('--ink', `hsl(${hue} ${Math.min(52, vividness)}% 20%)`)
    root.style.setProperty('--brand-hover', `hsl(${hue} ${vividness}% ${hoverLightness}%)`)
    root.style.setProperty('--brand-accent', `hsl(${hue} ${vividness}% 66%)`)
    root.style.setProperty('--mint', `hsl(${hue} ${Math.min(58, vividness)}% 92%)`)
    root.style.setProperty('--lime', `hsl(${hue} ${Math.min(78, vividness)}% 74%)`)
    root.dataset.logoTheme = 'active'
  } catch {
    if (revision === themeRevision) resetTheme()
  }
}
