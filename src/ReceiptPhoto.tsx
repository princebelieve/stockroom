import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { readReceiptPhoto, receiptSuggestions } from './lib/receiptOcr'
import { referenceFromScan } from './lib/reconciliation'

export function ReceiptPhoto({ total, onReference }: { total: number; onReference: (reference: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<ReturnType<typeof receiptSuggestions> | null>(null)
  const [reference, setReference] = useState('')
  const [checked, setChecked] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const libraryInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => { setChecked(false) }, [total])
  async function read(file?: File) {
    if (!file) return
    controller.current?.abort()
    const current = new AbortController(); controller.current = current
    setBusy(true); setResult(null); setChecked(false); setReference(''); setMessage('Reading photo on this device…')
    try {
      const text = await readReceiptPhoto(file, current.signal, setMessage)
      if (current.signal.aborted) return
      const suggestion = receiptSuggestions(text)
      setResult(suggestion); setReference(suggestion.reference)
      setMessage(suggestion.ambiguous ? 'Multiple references found. Enter the correct reference from the receipt.' : 'Review the original receipt. Recognition can misread letters and digits.')
    } catch (error) { if (controller.current === current) setMessage(error instanceof Error ? error.message : 'Could not read receipt.') }
    finally { if (controller.current === current) setBusy(false) }
  }
  const selectPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoPickerOpen(false)
    void read(event.target.files?.[0])
    event.target.value = ''
  }
  return <div className="receipt-photo">
    <input ref={libraryInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={selectPhoto} />
    <input ref={cameraInput} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={selectPhoto} />
    <button type="button" className="filter-button" disabled={busy} onClick={() => setPhotoPickerOpen(true)}>Add receipt photo</button>
    <small>Optional: use a receipt photo only when its barcode or QR cannot be scanned. The image is processed locally and is not saved with the sale.</small>
    {photoPickerOpen && <div className="receipt-photo-picker" role="dialog" aria-modal="true" aria-label="Add receipt photo" onClick={() => setPhotoPickerOpen(false)}><div onClick={event => event.stopPropagation()}><h3>Add receipt photo</h3><p>Choose where the receipt image comes from.</p><button type="button" className="primary-button" onClick={() => libraryInput.current?.click()}>Choose existing photo</button><button type="button" className="filter-button" onClick={() => cameraInput.current?.click()}>Take photo</button><button type="button" className="text-button" onClick={() => setPhotoPickerOpen(false)}>Cancel</button></div></div>}
    {busy && <button type="button" className="filter-button" onClick={() => controller.current?.abort()}>Cancel reading</button>}
    <p role="status">{message}</p>
    {result && <><p>{result.status}</p>{result.amount && <p>Detected amount: {result.amount}{Math.round(Number(result.amount) * 100) !== Math.round(total * 100) ? ' — does not match this sale' : ' — matches this sale total'}</p>}
      <label>Review receipt reference<input value={reference} maxLength={120} onChange={e => { setReference(e.target.value); setChecked(false) }} /></label>
      <label className="checkbox-label"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I checked the original receipt: payment approved, amount and currency match this sale, and reference is correct.</label>
      <button type="button" className="filter-button" disabled={!checked || !reference.trim()} onClick={() => { try { onReference(referenceFromScan(reference)); setResult(null); setMessage('Reviewed reference added. Complete the sale when ready.') } catch (error) { setMessage(String(error)) } }}>Use reviewed reference</button>
    </>}
  </div>
}
