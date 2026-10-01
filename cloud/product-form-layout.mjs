const fields = ['name', 'barcode', 'sku', 'category', 'unit', 'stock', 'reorder', 'cost', 'price']
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode })

export function extractProductForm(annotation, provider = 'Google Cloud Vision') {
  if (annotation?.pages?.length !== 1) throw fail('Upload one complete product form per photo.')
  const page = annotation.pages[0]
  const words = (page.blocks || []).flatMap(block => (block.paragraphs || []).flatMap(paragraph => (paragraph.words || []).map(word => {
    const points = word.boundingBox?.vertices || []
    return { text: (word.symbols || []).map(symbol => symbol.text || '').join(''), confidence: word.confidence || 0,
      x: Math.min(...points.map(point => point.x || 0)), y: Math.min(...points.map(point => point.y || 0)),
      bottom: Math.max(...points.map(point => point.y || 0)), points }
  }))).filter(word => Number.isFinite(word.x) && Number.isFinite(word.y))
  const anchors = Array.from({ length: 10 }, (_, i) => {
    // Printed zero/one markers are sometimes read as O/I/l. Normalize only
    // marker-shaped tokens; never change the owner's product values.
    const matches = words.filter(word => word.text.replace(/^F([0-9OIl]{2})$/i, (_, digits) => `F${digits.replace(/O/gi, '0').replace(/[Il]/gi, '1')}`) === `F${String(i + 1).padStart(2, '0')}`)
    if (matches.length !== 1) throw fail('Field markers could not be read. Use the latest printed form and photograph the full page upright, including F01 through F10.')
    return matches[0]
  })
  const height = (anchors[9].y - anchors[0].y) / 9
  if (!(height > 20)) throw fail('The form is too small or rotated. Take a clearer, upright photo.')
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]
    const [left, right] = anchor.points
    if (!left || !right || Math.abs((right.y || 0) - (left.y || 0)) > Math.abs((right.x || 0) - (left.x || 0)) * .12
      || Math.abs(anchor.x - anchors[0].x) > height * .5
      || (i && (anchor.y - anchors[i - 1].y < height * .65 || anchor.y - anchors[i - 1].y > height * 1.4))) throw fail('The form is tilted or distorted. Retake it straight-on with all four corners visible.')
  }
  const result = {}
  for (let i = 0; i < fields.length; i++) {
    const gap = anchors[i + 1].y - anchors[i].y
    const candidates = words.filter(word => word.y >= anchors[i].y + gap * .40 && word.bottom < anchors[i + 1].y - gap * .08 && word.x >= anchors[i].x - gap * .15)
      .sort((a, b) => Math.abs(a.y - b.y) < gap * .13 ? a.x - b.x : a.y - b.y)
    const raw = candidates.map(word => word.text).join(' ').trim()
    let value = raw || null
    let state = value ? 'suggested' : 'blank'
    if (candidates.some(word => word.confidence < .88) || raw.length > 180) { value = null; state = 'uncertain' }
    if (i >= 5 && value) {
      const amount = value.replace(/\s+/g, '')
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(Math.round(Number(amount.replaceAll(',', '')) * 100))) { value = null; state = 'uncertain' }
      else value = Number(amount.replaceAll(',', ''))
    }
    if ((fields[i] === 'barcode' || fields[i] === 'sku') && value && /\s/.test(value)) { value = null; state = 'uncertain' }
    result[fields[i]] = { value, state }
  }
  return { fields: result, provider, template: 'stockroom-product-v1' }
}
