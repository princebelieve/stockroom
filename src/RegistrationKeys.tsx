import { useState } from 'react'
import { AsyncForm, SubmitButton } from './AsyncControls'
import { cloudRequest } from './lib/cloudRequest'

export function RegistrationKeys({ apiUrl, onToken }: { apiUrl: string; onToken: (token: string, refresh: string) => void }) {
  const [issued, setIssued] = useState<{ key: string; email: string; businessName: string; businessId: string; expiresAt: string } | null>(null)
  return <section className="panel full-panel"><h2>Business registration keys</h2><p>Create a one-use key for a new customer. Send them the customer instructions below. They can complete setup themselves in Stockroom without your admin key.</p>
    <AsyncForm className="settings-form" busyLabel="Generating key…" onSubmit={async event => {
      setIssued(null)
      const input = Object.fromEntries(new FormData(event.currentTarget))
      setIssued(await cloudRequest(apiUrl, '/v1/registration-keys', { method: 'POST', body: JSON.stringify(input) }, onToken))
    }}>
      <label>Business name<input name="businessName" required maxLength={60} /></label>
      <p>The business ID is generated automatically.</p>
      <label>Owner email<input name="email" type="email" required /></label>
      <label>Key valid for (days)<input name="expiresInDays" type="number" min={1} max={30} defaultValue={7} required /></label>
      <SubmitButton className="primary-button">Generate registration key</SubmitButton>
    </AsyncForm>
    {issued && <div role="status"><p>Key for <strong>{issued.businessName}</strong> — {issued.email}. Expires {new Date(issued.expiresAt).toLocaleString()}.</p><label>Copy and save this key now<input readOnly value={issued.key} onFocus={event => event.target.select()} /></label><p>This key is only displayed here once; the server stores its hash. The customer enters this key in Stockroom?s new-business setup. Subscription and payment remain in the app.</p></div>}
    {issued && <p>Automatically generated business ID: <strong>{issued.businessId}</strong></p>}
  </section>
}
