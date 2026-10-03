import { useEffect, useRef, useState } from 'react'
import { AsyncButton } from './AsyncControls'
import { posRequest } from './PosTools'

export type TerminalPayment = { orderId: string; amount: number; currency: string; reference: string; status: string; paid: boolean }
export function PaystackTerminalPayment({ orderId, amount, currency, branchId, headers, onStatus }: {
  orderId: string; amount: number; currency: string; branchId: string; headers: Record<string, string>; onStatus: (state: TerminalPayment) => void
}) {
  const [config, setConfig] = useState<{ configured: boolean; terminalId: string; testMode: boolean } | null>(null)
  const [status, setStatus] = useState(''), [error, setError] = useState('')
  const sending = useRef(false)
  useEffect(() => {
    let active = true
    void posRequest('/api/integrations/paystack/config', headers).then(value => { if (active) setConfig(value) }).catch(caught => { if (active) setError(caught.message) })
    return () => { active = false }
  }, [headers.Authorization, branchId])
  async function verify() {
    const result = await posRequest('/api/integrations/paystack/verify', headers, { orderId })
    if (result.status === 'not-started') localStorage.removeItem(`stockroom-paystack-pending:${orderId}`)
    setStatus(result.paid ? 'Payment verified. You can complete the sale.' : result.status === 'not-started' ? 'Ready to send this amount to the terminal.' : `Waiting for payment (${result.status}).`)
    onStatus(result)
  }
  useEffect(() => {
    if (!config?.configured) return
    let active = true, checking = false
    setStatus(''); setError('')
    const poll = async () => {
      if (!active || checking || sending.current) return
      checking = true
      try {
        const result = await posRequest('/api/integrations/paystack/verify', headers, { orderId })
        if (!active) return
        if (sending.current) return
        if (result.status === 'not-started') localStorage.removeItem(`stockroom-paystack-pending:${orderId}`)
        setStatus(result.paid ? 'Payment verified. You can complete the sale.' : result.status === 'not-started' ? 'Ready to send this amount to the terminal.' : `Waiting for payment (${result.status}).`)
        setError(''); onStatus(result)
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Could not check payment.') }
      finally { checking = false }
    }
    void poll()
    const timer = window.setInterval(() => { void poll() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [config?.configured, orderId])
  return <div className="pos-paystack"><p>Paystack terminal {config?.terminalId || ''}{config?.testMode ? ' · Test mode' : ''}</p>{config && !config.configured && <p>Ask the owner to connect this shop’s Paystack account and terminal.</p>}
    <AsyncButton className="filter-button" busyLabel="Sending to terminal..." disabled={!config?.configured || status.startsWith('Payment verified') || status.startsWith('Waiting')} onClick={async () => {
      setError('')
      sending.current = true
      try {
        localStorage.setItem(`stockroom-paystack-pending:${orderId}`, JSON.stringify({ orderId, amount, currency, branchId }))
        onStatus({ orderId, amount, currency, reference: '', status: 'sending', paid: false })
        setStatus('Waiting for the terminal request.')
        const result = await posRequest('/api/integrations/paystack/start', headers, { orderId, amount, currency, branchId })
        onStatus(result); setStatus(result.paid ? 'Payment verified. You can complete the sale.' : 'Waiting for payment on the terminal.')
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not send payment.'); await verify().catch(() => undefined) }
      finally { sending.current = false }
    }}>Send amount to Paystack terminal</AsyncButton>
    <AsyncButton className="text-button" busyLabel="Checking payment..." disabled={sending.current} onClick={verify}>Check payment status</AsyncButton>
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}<small>Complete the sale after Paystack confirms payment. If the connection drops, check status before taking another payment.</small>
  </div>
}
