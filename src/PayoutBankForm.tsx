import { useRef, useState, useEffect } from 'react'

type Request = (path: string, init?: RequestInit) => Promise<any>
export function PayoutBankForm({ request, onSaved, className = 'settings-form', buttonClass = 'primary-button' }: { request: Request; onSaved: () => Promise<void>; className?: string; buttonClass?: string }) {
  const [currency, setCurrency] = useState('NGN')
  const [banks, setBanks] = useState<Array<{ code: string; name: string }>>([])
  const [bankCode, setBank] = useState('')
  const [accountNumber, setNumber] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const version = useRef(0)
  const requestRef = useRef(request); requestRef.current = request
  useEffect(() => {
    let cancelled = false
    setBanks([])
    void requestRef.current(`/v1/referral-wallet/banks?currency=${currency}`).then(data => { if (!cancelled) setBanks(data.banks) }).catch(() => { if (!cancelled) setMessage('Bank list unavailable. Please try again later.') })
    return () => { cancelled = true; version.current++ }
  }, [currency])
  const reset = () => { version.current++; setName(''); setMessage('') }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const current = version.current
    setBusy(true); setMessage('')
    try {
      const result = await request(name ? '/v1/referral-wallet/profile' : '/v1/referral-wallet/resolve', { method: 'POST', body: JSON.stringify({ currency, bankCode, accountNumber, confirmedName: name }) })
      if (current !== version.current) return
      if (!name) setName(result.name)
      else { setMessage(`Bank account saved: ${result.profile.name}, ending ${result.profile.accountLast4}.`); await onSaved() }
    } catch (error) { if (current === version.current) setMessage(error instanceof Error ? error.message : 'Could not verify this account. Please try again.') }
    finally { setBusy(false) }
  }
  return <form className={className} onSubmit={submit}>
    <h3>Bank account for withdrawals</h3><p>Select your bank and enter your account number. Stockroom will look up the account name for you.</p>
    <label>Currency<select aria-label="Currency" value={currency} disabled={busy} onChange={e => { reset(); setBank(''); setCurrency(e.target.value) }}><option>NGN</option><option>GHS</option></select></label>
    <label>Bank<select aria-label="Bank" required value={bankCode} disabled={busy} onChange={e => { reset(); setBank(e.target.value) }}><option value="">Select your bank</option>{banks.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
    <label>Account number<input required inputMode="numeric" autoComplete="off" pattern="[0-9]{6,20}" minLength={6} maxLength={20} disabled={busy} value={accountNumber} onChange={e => { reset(); setNumber(e.target.value) }} /></label>
    <label>Account name<input readOnly value={name} placeholder="Appears after checking your account" /></label>
    {name && <p>Check that this is the account you want to receive your withdrawals.</p>}
    <button className={buttonClass} disabled={busy}>{busy ? 'Please wait…' : name ? 'Confirm and save bank account' : 'Check account name'}</button>
    {message && <p role="status">{message}</p>}
    <small>For other currencies, contact Stockroom support. Your full account number is used securely for verification and is not stored by Stockroom.</small>
  </form>
}
