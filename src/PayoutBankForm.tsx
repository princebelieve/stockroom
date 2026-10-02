import { useRef, useState, useEffect } from 'react'

type Request = (path: string, init?: RequestInit) => Promise<any>
export function PayoutBankForm({ request, onSaved, className = 'settings-form', buttonClass = 'primary-button' }: { request: Request; onSaved: () => Promise<void>; className?: string; buttonClass?: string }) {
  const [currency, setCurrency] = useState('NGN')
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([])
  const [bankCode, setBank] = useState('')
  const [accountNumber, setNumber] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [lookupAttempt, setLookupAttempt] = useState(0)
  const [message, setMessage] = useState('')
  const version = useRef(0)
  const requestRef = useRef(request); requestRef.current = request
  useEffect(() => {
    let cancelled = false
    setBanks([])
    void requestRef.current(`/v1/referral-wallet/banks?currency=${currency}`).then(data => { if (!cancelled) setBanks(data.banks || []) }).catch(() => { if (!cancelled) setMessage('Bank list unavailable. Please try again later.') })
    return () => { cancelled = true; version.current++ }
  }, [currency])
  const validNumber = currency === 'NGN' ? /^\d{10}$/.test(accountNumber) : /^\d{6,20}$/.test(accountNumber)
  useEffect(() => {
    if (!bankCode || !validNumber) { setResolving(false); return }
    let cancelled = false
    const current = version.current
    setResolving(true); setMessage('')
    const timer = window.setTimeout(() => {
      void requestRef.current('/v1/referral-wallet/resolve', { method: 'POST', body: JSON.stringify({ currency, bankCode, accountNumber }) })
        .then(result => {
          if (cancelled || current !== version.current) return
          if (!result.name) throw new Error('Could not verify this account. Please try again.')
          setName(result.name)
        })
        .catch(error => { if (!cancelled && current === version.current) setMessage(error instanceof Error ? error.message : 'Could not verify this account. Please try again.') })
        .finally(() => { if (!cancelled && current === version.current) setResolving(false) })
    }, 600)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [currency, bankCode, accountNumber, validNumber, lookupAttempt])
  const reset = () => { version.current++; setName(''); setMessage('') }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name || resolving || busy) return
    const current = version.current
    setBusy(true); setMessage('')
    try {
      const result = await request('/v1/referral-wallet/profile', { method: 'POST', body: JSON.stringify({ currency, bankCode, accountNumber, confirmedName: name }) })
      if (current !== version.current) return
      setMessage(`Bank account saved: ${result.profile.name}, ending ${result.profile.accountLast4}.`); await onSaved()
    } catch (error) { if (current === version.current) setMessage(error instanceof Error ? error.message : 'Could not verify this account. Please try again.') }
    finally { setBusy(false) }
  }
  return <form className={className} onSubmit={submit}>
    <h3>Bank account for withdrawals</h3><p>Select your bank and enter your account number. Stockroom will look up the account name for you.</p>
    <label>Currency<select aria-label="Currency" value={currency} disabled={busy} onChange={e => { reset(); setBank(''); setCurrency(e.target.value) }}><option>NGN</option><option>GHS</option></select></label>
    <label>Bank<select aria-label="Bank" required value={bankCode} disabled={busy} onChange={e => { reset(); setBank(e.target.value) }}><option value="">Select your bank</option>{banks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
    <label>Account number<input required inputMode="numeric" autoComplete="off" pattern={currency === 'NGN' ? '[0-9]{10}' : '[0-9]{6,20}'} minLength={currency === 'NGN' ? 10 : 6} maxLength={currency === 'NGN' ? 10 : 20} disabled={busy} value={accountNumber} onChange={e => { reset(); setNumber(e.target.value.replace(/\s/g, '')) }} /></label>
    <label>Account name<input readOnly value={name} placeholder={resolving ? 'Looking up account name...' : 'Appears automatically after entering bank details'} aria-busy={resolving} /></label>
    {name && <p>Check that this is the account you want to receive your withdrawals.</p>}
    {resolving && <p role="status">Looking up your account name...</p>}
    <button className={buttonClass} disabled={busy || resolving || !name}>{busy ? 'Saving...' : 'Confirm and save bank account'}</button>
    {!resolving && !name && bankCode && validNumber && message && <button type="button" className={buttonClass} onClick={() => { reset(); setLookupAttempt(attempt => attempt + 1) }}>Retry account lookup</button>}
    {message && <p role="status">{message}</p>}
    <small>For other currencies, contact Stockroom support. Your full account number is used securely for verification and is not stored by Stockroom.</small>
  </form>
}
