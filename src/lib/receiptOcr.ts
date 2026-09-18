export function receiptSuggestions(text: string) {
  // Only labelled references are candidates. Never infer one from PAN/card numbers.
  const references = [...text.matchAll(/(?:\bRRN|\bREF(?:ERENCE)?(?:\s*(?:NUMBER|NO\.?))?|TRANSACTION\s*(?:ID|REFERENCE))\s*[:#=-]?\s*([A-Z0-9][A-Z0-9._/-]{3,119})/gi)].map(m => m[1])
  const unique = [...new Set(references)]
  const amounts = [...text.matchAll(/(?:\bAMOUNT|\bTOTAL)\s*[:=-]?\s*(?:NGN|USD|GHS|KES|GBP|EUR|[₦$£€])?\s*([\d,]+\.\d{2})/gi)].map(m => m[1].replaceAll(',', ''))
  return { reference: unique.length === 1 ? unique[0] : '', ambiguous: unique.length > 1, amount: [...new Set(amounts)].length === 1 ? amounts[0] : '', status: /\b(declined|failed|reversed|unsuccessful|not approved)\b/i.test(text) ? 'Failure/reversal text detected' : /\b(approved|successful|success)\b/i.test(text) ? 'Approval text detected — check original receipt' : 'Status not identified' }
}

export async function readReceiptPhoto(file: File, signal: AbortSignal, progress: (message: string) => void) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 15 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP receipt photo smaller than 15 MB.')
  const { createWorker } = await import('tesseract.js')
  if (signal.aborted) throw new Error('Reading cancelled.')
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort = () => {}
  const work = (async () => {
    worker = await createWorker('eng', 1, { workerPath: new URL('/ocr/worker.min.js', location.origin).href, corePath: new URL('/ocr', location.origin).href, langPath: new URL('/ocr', location.origin).href, logger: event => { if (!signal.aborted) progress(`${event.status} ${Math.round(event.progress * 100)}%`) } })
    if (signal.aborted || stopped) { await worker.terminate(); throw new Error('Reading cancelled.') }
    return (await worker.recognize(file)).data.text
  })()
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      abort = () => { stopped = true; void worker?.terminate(); reject(new Error('Reading cancelled.')) }
      signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => { stopped = true; void worker?.terminate(); reject(new Error('Receipt reading timed out. Try a clearer photo or enter the reference manually.')) }, 90000)
    })])
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); void worker?.terminate() }
}
