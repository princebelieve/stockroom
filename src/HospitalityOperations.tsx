import { useEffect, useState } from 'react'
import { posRequest } from './PosTools'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'

type RecordRow = { id: string; kind: string; updatedAt: string; status: string; [key: string]: any }
type Invoice = RecordRow & { hospitality: { recordId: string }; currency: string; pricing: { total: number }; balance: { paid: number; due: number } }
type Data = { stays: RecordRow[]; events: RecordRow[]; entries: RecordRow[]; invoices: Invoice[] }
const empty: Data = { stays: [], events: [], entries: [], invoices: [] }

export function HospitalityOperations({ headers, billingEnabled, openInvoice, money }: { headers: Record<string, string>; billingEnabled: boolean; openInvoice: (id: string) => void; money: (value:number)=>string }) {
  const [data, setData] = useState<Data>(empty)
  const [tab, setTab] = useState<'hotel' | 'nightlife'>('hotel')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function reload() {
    const next = await posRequest('/api/pos/hospitality', headers)
    setData(next)
    return next as Data
  }
  useEffect(() => {
    let live = true
    const load = () => void posRequest('/api/pos/hospitality', headers).then(value => { if (live) { setData(value); setError('') } }).catch(e => { if (live) setError(e.message) })
    load()
    const timer = setInterval(load, 10000)
    window.addEventListener('stockroom-data-refreshed', load)
    return () => { live = false; clearInterval(timer); window.removeEventListener('stockroom-data-refreshed', load) }
  }, [headers.Authorization, headers['X-Stockroom-Branch']])

  async function act(input: Record<string, unknown>): Promise<boolean> {
    setError(''); setMessage('')
    try {
      await posRequest('/api/pos/hospitality', headers, { ...input, expectedUpdatedAt: input.expectedUpdatedAt ?? '', commandId: crypto.randomUUID() })
      await reload()
      window.dispatchEvent(new Event('stockroom-data-refreshed'))
      setMessage('Saved.')
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save this record.'); return false }
  }
  async function createInvoice(record: RecordRow) {
    setError('')
    try {
      const result = await posRequest('/api/pos/hospitality/invoice', headers, { id: 'service-job:' + crypto.randomUUID(), commandId: crypto.randomUUID(), expectedUpdatedAt: '', estimate: false, hospitality: { recordId: record.id, recordKind: record.kind } })
      await reload()
      window.dispatchEvent(new Event('stockroom-data-refreshed'))
      openInvoice(result.job.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the invoice.') }
  }
  const invoiceFor = (id: string) => data.invoices.find(job => job.hospitality?.recordId === id)
  const invoiceStatus = (job?: Invoice) => job ? <><p>{job.status === 'cancelled' ? 'Invoice cancelled' : `Invoice total: ${money(job.pricing.total)} · Paid: ${money(job.balance.paid)} · Due: ${money(job.balance.due)}`}</p><button type="button" className="filter-button" onClick={() => openInvoice(job.id)}>{job.status === 'cancelled' ? 'View cancelled invoice' : job.balance.due > 0 ? 'Open invoice and record payment' : 'View invoice and receipts'}</button></> : null

  return <section className="panel hospitality-operations">
    <h2>Hospitality operations</h2>
    <p>Hotel charges and nightclub admission invoices use Jobs &amp; invoices. Partial payments are recorded as deposits, with a receipt for each payment.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <nav className="counter-tabs" aria-label="Hospitality operation type">
      <button type="button" className={tab === 'hotel' ? 'primary-button' : 'filter-button'} onClick={() => setTab('hotel')}>Hotel stays</button>
      <button type="button" className={tab === 'nightlife' ? 'primary-button' : 'filter-button'} onClick={() => setTab('nightlife')}>Nightlife events</button>
    </nav>

    {tab === 'hotel' ? <>
      <h3>Book a stay</h3>
      <AsyncForm className="form-grid" onSubmit={async event => {
        const form = event.currentTarget, fields = new FormData(form)
        if(await act({ action: 'book-stay', roomName: String(fields.get('room')), guestName: String(fields.get('guest')), guestPhone: String(fields.get('phone')), checkIn: String(fields.get('checkin')), checkOut: String(fields.get('checkout')), nightlyRate: Number(fields.get('rate')), note: String(fields.get('note')) })) form.reset()
      }}>
        <label>Room<input name="room" required maxLength={80} /></label><label>Guest name<input name="guest" required maxLength={200} /></label>
        <label>Phone<input name="phone" maxLength={80} /></label><label>Check in<input type="date" name="checkin" required /></label>
        <label>Check out<input type="date" name="checkout" required /></label><label>Rate per night<input name="rate" type="number" min="0.01" step="0.01" required /></label>
        <label>Notes<input name="note" maxLength={500} /></label><SubmitButton className="primary-button">Save booking</SubmitButton>
      </AsyncForm>
      <h3>Room stays</h3>
      {data.stays.length ? data.stays.map(row => {
        const invoice = invoiceFor(row.id)
        return <article className="customer-row" key={row.id}><div><strong>{row.roomName} · {row.guestName}</strong><small>{row.checkIn} to {row.checkOut} · {row.status} · {row.guestPhone}</small>
          {invoiceStatus(invoice)}{(!invoice || invoice.status === 'cancelled') && row.nightlyRate > 0 && billingEnabled && <button type="button" className="filter-button" onClick={() => void createInvoice(row)}>{invoice ? 'Create replacement stay invoice' : 'Create stay invoice'}</button>}
          {!invoice && row.nightlyRate > 0 && !billingEnabled && <small>Enable Payments &amp; receipts and grant Jobs &amp; invoices access to bill this stay.</small>}
          {!row.nightlyRate && <small>No nightly rate is saved for this booking.</small>}
        </div>
          {row.status === 'booked' && <AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'checked-in' }) }}>Check in</AsyncButton>}
          {row.status === 'checked-in' && <AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'checked-out' }) }}>Check out</AsyncButton>}
          {row.status === 'booked' && <AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'cancelled' }) }}>Cancel</AsyncButton>}
        </article>
      }) : <p>No stays booked.</p>}
    </> : <>
      <h3>Create an event</h3>
      <AsyncForm className="form-grid" onSubmit={async event => {
        const form = event.currentTarget, fields = new FormData(form)
        if(await act({ action: 'create-event', name: String(fields.get('name')), startsAt: new Date(String(fields.get('startsAt'))).toISOString(), capacity: Number(fields.get('capacity')), admissionPrice: Number(fields.get('admissionPrice')) })) form.reset()
      }}>
        <label>Event name<input name="name" required maxLength={200} /></label><label>Starts<input type="datetime-local" name="startsAt" required /></label>
        <label>Guest capacity<input type="number" name="capacity" min="0" max="100000" defaultValue="0" /></label>
        <label>Admission price<input type="number" name="admissionPrice" min="0" step="0.01" defaultValue="0" required /></label>
        <SubmitButton className="primary-button">Create event</SubmitButton>
      </AsyncForm>
      <h3>Events and guest list</h3>
      {data.events.map(event => <article className="panel" key={event.id}>
        <strong>{event.name}</strong><p>{new Date(event.startsAt).toLocaleString()} · {data.entries.filter(row => row.eventId === event.id && row.status !== 'cancelled').length}{event.capacity ? ` / ${event.capacity}` : ''} guests · Admission {money(event.admissionPrice || 0)} · {event.status}</p>
        {event.status === 'scheduled' && <><AsyncForm onSubmit={async formEvent => { const form = formEvent.currentTarget, fields = new FormData(form); if(await act({ action: 'add-guest', eventId: event.id, guestName: String(fields.get('guest')), guestPhone: String(fields.get('phone')) })) form.reset() }}>
          <label>Guest<input name="guest" required maxLength={200} /></label><label>Phone<input name="phone" maxLength={80} /></label><SubmitButton className="filter-button">Add guest</SubmitButton>
        </AsyncForm><AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: event.id, expectedUpdatedAt: event.updatedAt, status: 'closed' }) }}>Close event</AsyncButton><AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: event.id, expectedUpdatedAt: event.updatedAt, status: 'cancelled' }) }}>Cancel event</AsyncButton></>}
        {data.entries.filter(row => row.eventId === event.id).map(row => {
          const invoice = invoiceFor(row.id)
          return <div className="customer-row" key={row.id}><div><strong>{row.guestName}</strong><small>{row.guestPhone} · {row.status}</small>
            {invoiceStatus(invoice)}{(!invoice || invoice.status === 'cancelled') && row.admissionPrice > 0 && billingEnabled && <button type="button" className="filter-button" onClick={() => void createInvoice(row)}>{invoice ? 'Create replacement admission invoice' : 'Create admission invoice'}</button>}
            {!invoice && row.admissionPrice > 0 && !billingEnabled && <small>Enable Payments &amp; receipts and grant Jobs &amp; invoices access to bill admission.</small>}
            {!row.admissionPrice && <small>Free entry</small>}
          </div>{row.status === 'expected' && <><AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'checked-in' }) }}>Check in</AsyncButton><AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'cancelled' }) }}>Cancel entry</AsyncButton></>}</div>
        })}
      </article>)}
      {!data.events.length && <p>No events created.</p>}
    </>}
  </section>
}
