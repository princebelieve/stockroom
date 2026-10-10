import { useEffect, useRef, useState } from 'react'
import { readReceiptPhoto } from './lib/receiptOcr'
import { labelSuggestion, lookupProductBarcode } from './lib/productIntake'
import type { ShopProfile, CatalogueWorkspace } from '../server/shop-profile.mjs'

export function PackageProductPhoto({ lookupApiUrl = '', shopProfile, catalogueWorkspace = 'product-sales' }: { lookupApiUrl?: string; shopProfile?: ShopProfile; catalogueWorkspace?: CatalogueWorkspace }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  return <div className="package-photo"><label>Fill from a package photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async event => {
    const file = event.target.files?.[0]
    const form = event.target.form
    event.target.value = ''
    if (!file || !form) return
    const abort = new AbortController(); controller.current = abort
    setBusy(true); setMessage('Reading your package photo...')
    try {
      const text = await readReceiptPhoto(file, abort.signal, () => {}, true)
      if (abort.signal.aborted) return
      const draft = labelSuggestion(text)
      let lookupNote = ''
      if (draft.barcode) {
        setMessage('Reading the package and checking its barcode...')
        try {
          const match = await lookupProductBarcode(draft.barcode, lookupApiUrl, shopProfile, catalogueWorkspace)
          if (match?.name) { Object.assign(draft, match); lookupNote = ' Barcode catalogue suggestion added.' }
        } catch {
          lookupNote = ' Online barcode lookup was unavailable; photo text was used.'
        }
      }
      let filled = 0
      for (const key of ['name', 'barcode'] as const) {
        const input = form.elements.namedItem(key)
        if (input instanceof HTMLInputElement && draft[key] && (!input.value.trim() || key === 'name' && Boolean(lookupNote))) {
          input.value = draft[key]; input.dispatchEvent(new Event('input', { bubbles: true })); filled++
        }
      }
      for (const [fieldId, value] of Object.entries(draft.customValues || {})) {
        const input = form.elements.namedItem(`custom:${fieldId}`)
        if (input instanceof HTMLInputElement && !input.value.trim()) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); filled++ }
      }
      if (draft.category) {
        const category = form.elements.namedItem('category')
        if (category instanceof HTMLSelectElement) {
          const known = [...category.options].some(option => option.value === draft.category)
          if (known) category.value = draft.category
          else {
            category.value = '__custom__'; category.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)))
            const customCategory = form.elements.namedItem('customCategory')
            if (customCategory instanceof HTMLInputElement && !customCategory.value.trim()) { customCategory.value = draft.category; customCategory.dispatchEvent(new Event('input', { bubbles: true })); filled++ }
          }
        }
      }
      setMessage(filled ? `Details filled in this form. Check them and complete anything missing before saving.${lookupNote}` : `No empty fields could be filled. Your entries are unchanged; complete the details below.${lookupNote}`)
    } catch { if (!abort.signal.aborted) setMessage('Could not read this photo. Try a clearer one or fill in the details below.') }
    finally { if (!abort.signal.aborted) setBusy(false) }
  }} /></label><small>Show the product name clearly. Existing entries are kept.</small>{message && <p role="status">{message}</p>}</div>
}
