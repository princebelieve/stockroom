import { useEffect, useRef, useState } from 'react'
import { cloudRequest } from './lib/cloudRequest'
import { readLocalProductForm } from './lib/localProductForm'
import { draftProblem, type ProductDraft } from './lib/productIntake'
import type { Product } from './types'

const fields = ['name', 'barcode', 'sku', 'category', 'unit', 'stock', 'reorder', 'cost', 'price'] as const
const labels = { name: 'Product name', barcode: 'Barcode', sku: 'SKU', category: 'Category', unit: 'Unit', stock: 'Starting stock', reorder: 'Reorder point', cost: 'Cost price per unit', price: 'Selling price per unit' }
type Reading = { fields: Record<typeof fields[number], { value: string | number | null; state: 'blank' | 'uncertain' | 'suggested' }> }
const emptyReading = (): Reading => ({ fields: Object.fromEntries(fields.map(field => [field, { value: null, state: 'blank' }])) as Reading['fields'] })

export async function prepareFormPhoto(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP photo smaller than 15 MB.')
  const bitmap = await createImageBitmap(file)
  try {
    if (Math.min(bitmap.width, bitmap.height) < 700) throw new Error('This photo is too small. Use a clearer, full-page photo.')
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This device cannot prepare the photo.')
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const image = canvas.toDataURL('image/jpeg', .9)
    if (image.length > 4_000_000) throw new Error('The photo is too large. Crop to the page and try again.')
    return image
  } finally { bitmap.close() }
}

export function HandwrittenProductForm({ apiUrl, token, onToken, products, create }: { apiUrl: string; token: string; onToken: (token: string, refresh: string) => void; products: Product[]; create: (draft: ProductDraft) => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<Reading | null>(null)
  const [draft, setDraft] = useState<ProductDraft>({ name: '' })
  const [reviewed, setReviewed] = useState(false)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reading, setReading] = useState(false)
  const [message, setMessage] = useState('')
  const locked = useRef(false)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => { if (!file) { setPreview(''); return }; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])
  useEffect(() => () => controller.current?.abort(), [])
  const validation = draftProblem(draft, products.flatMap(product => [product.barcode || '', product.sku]), [])
    || (!draft.unit?.trim() ? 'Enter the unit used on this form.' : '')
    || (draft.sku?.trim() && products.some(product => product.sku === draft.sku?.trim()) ? 'This SKU already exists. Check inventory before saving.' : '')
  async function run(action: () => Promise<void>) {
    if (locked.current) return
    locked.current = true; setBusy(true); setMessage('')
    try { await action() } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not finish. Please try again.') }
    finally { locked.current = false; setBusy(false) }
  }
  async function read(local = false) {
    if (!file || (!local && !consent)) return
    setReading(true); setReviewed(false)
    controller.current = new AbortController()
    const timer = setTimeout(() => controller.current?.abort(), 65000)
    try {
      let data: Reading
      if (local) {
        setMessage('Reading on this device. No photo is being uploaded...')
        data = await readLocalProductForm(file, controller.current.signal, progress => setMessage(`On-device reading: ${progress}`))
      } else {
        const status = await cloudRequest(apiUrl, '/v1/product-forms/status', { signal: controller.current.signal }, onToken, token)
        if (!status.configured) throw new Error('Google reading is not configured.')
        setMessage('Reading with Google. This may take up to a minute...')
        const image = await prepareFormPhoto(file)
        data = await cloudRequest(apiUrl, '/v1/product-forms/read', { method: 'POST', signal: controller.current.signal, body: JSON.stringify({ image }) }, onToken, token) as Reading
      }
      if (!data.fields || fields.some(field => !data.fields[field])) throw new Error('The handwriting service returned an incomplete result. Try again.')
      const next: ProductDraft = { ...draft }
      for (const field of fields) {
        const value = data.fields[field].value
        if (value !== null && data.fields[field].state === 'suggested' && (next[field] === undefined || next[field] === '')) Object.assign(next, { [field]: value })
      }
      setDraft(next); setResult(data); setMessage('Suggestions filled empty fields; your existing entries were kept. Compare every value with the photo before saving.')
    } catch (error) {
      setMessage(`${controller.current?.signal.aborted ? 'Automatic reading stopped.' : error instanceof Error ? error.message : 'Automatic reading is unavailable.'} ${local ? 'Enter any unread details beside the photo.' : 'Try Autofill on this device, or enter the details beside the photo.'} You can save without Google recognition. Your entries have been kept.`)
    } finally { clearTimeout(timer); setReading(false) }
  }
  return <section className="panel full-panel">
    <h2>Upload completed product form</h2>
    <p><strong>For best results, write clearly in BLOCK / CAPITAL LETTERS, one answer per box.</strong> Always check the details before saving.</p>
    <p>Photograph one handwritten form with all four corners and markers F01–F10 visible. Use the latest blank form, keep the page upright, and write beneath each heading.</p>
    <fieldset disabled={busy} style={{ border: 0, padding: 0, minWidth: 0 }}>
      <label>Completed paper form photo<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        const selected = event.target.files?.[0]; event.target.value = ''
        if (!selected) return
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 15 * 1024 * 1024) { setMessage('Choose a JPG, PNG or WebP photo smaller than 15 MB.'); return }
        setFile(selected); setResult(emptyReading()); setDraft({ name: '' }); setReviewed(false); setConsent(false); setMessage('Enter the details beside your photo, or optionally try automatic reading. No recognition service is needed to save.')
      }} /></label>
      <p>Autofill on this device uses the bundled English text reader: no Google account, API key or recognition-service bill, and no photo upload. It works best with printed text; handwriting, even block capitals, may need correction. Offline reading needs the app's reader files available on this device. You can always enter the details yourself.</p>
      <button type="button" className="primary-button" disabled={!file} onClick={() => void run(() => read(true))}>Autofill on this device</button>
      <p>Google recognition is optional and needs internet and an available service. Only if you choose it is the photo sent through Stockroom to Google. JPG, PNG or WebP, up to 15 MB; PDF forms need a photo or screenshot.</p>
      <label><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />Send this photo to Google Cloud Vision to read the handwriting.</label>
      <button type="button" className="filter-button" disabled={!file || !consent} onClick={() => void run(() => read())}>Read completed form</button>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        {preview && <a href={preview} target="_blank" rel="noreferrer" style={{ flex: '1 1 260px' }}><img src={preview} alt="Uploaded handwritten product form for comparison" style={{ width: '100%', maxWidth: 480, height: 'auto' }} /><span>Open photo full size</span></a>}
        {result && <div style={{ flex: '1 1 280px' }}><div className="form-grid">{fields.map((field, index) => <label key={field}>{labels[field]}<input aria-label={`Form ${labels[field]}`} type={index >= 5 ? 'number' : 'text'} min={index >= 5 ? 0 : undefined} step={index >= 5 ? 'any' : undefined} value={draft[field] ?? ''} onChange={event => { const value = event.target.value; setDraft(current => ({ ...current, [field]: index >= 5 ? value === '' ? undefined : Number(value) : value })); setReviewed(false) }} /><small>{result.fields[field].state === 'suggested' ? 'Suggested — verify against photo' : result.fields[field].state === 'uncertain' ? 'Uncertain — please enter this answer' : 'No answer read — complete if needed'}</small></label>)}</div>
          <p>Blank SKU is generated automatically. Blank cost and reorder point save as 0. Enter selling price and stock explicitly, including 0 where appropriate.</p>
          {validation && <p role="status">{validation}</p>}
          <label><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I checked every field against the handwritten form.</label>
          <button type="button" className="primary-button" disabled={!reviewed || Boolean(validation)} onClick={() => void run(async () => {
            if (!reviewed || validation) return
            await create({ ...draft, name: draft.name.trim(), sku: draft.sku?.trim(), barcode: draft.barcode?.trim(), unit: draft.unit?.trim() })
            setResult(null); setFile(null); setReviewed(false); setConsent(false); setMessage('Product saved. You can upload the next completed form.')
          })}>Save reviewed product</button>
          <small>If saving fails after a connection interruption, refresh inventory and check for the product before trying again.</small>
        </div>}
      </div>
    </fieldset>
    {reading && <button type="button" className="filter-button" onClick={() => controller.current?.abort()}>Stop reading and enter manually</button>}
    {message && <p role="status">{message}</p>}
  </section>
}
