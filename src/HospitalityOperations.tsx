import { useEffect, useState } from 'react'
import { posRequest } from './PosTools'
import { AsyncButton, AsyncForm, SubmitButton } from './AsyncControls'

type RecordRow = { id: string; kind: string; updatedAt: string; status: string; [key: string]: any }
type Invoice = RecordRow & { hospitality: { recordId: string; chargeType?: string }; currency: string; pricing: { total: number }; balance: { paid: number; due: number } }
type Room = RecordRow & { roomName: string; nightlyRate: number; housekeepingStatus?: 'ready'|'dirty'|'cleaning'; housekeepingAssignedTo?:string; housekeepingScheduledAt?:string }
type StockItem = { id:string; name:string; unit:string; stock:number; price:number }
type TableReservation = {id:string;nightlifeEventId:string;nightlifeEventName:string;name:string;guests:number;tableName:string;status:string;startAt:string}
type VenueTab = {id:string;nightlifeEventId:string;nightlifeEventName:string;name:string;guests:number;sessionId:string}
type HousekeepingStaff = {id:string;name:string}
const localDateTimeValue=(value?:string)=>{if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`}
const dateTimeInputIso=(value:string)=>value?new Date(value).toISOString():''
type Data = { rooms: Room[]; stays: RecordRow[]; events: RecordRow[]; entries: RecordRow[]; invoices: Invoice[]; stockItems:StockItem[]; tableReservations:TableReservation[]; venueTabs:VenueTab[]; housekeepingStaff:HousekeepingStaff[] }
const empty: Data = { rooms: [], stays: [], events: [], entries: [], invoices: [], stockItems:[], tableReservations:[], venueTabs:[], housekeepingStaff:[] }

export function HospitalityOperations({ headers, billingEnabled, openInvoice, money, restaurantEnabled, openTables, hotelEnabled, nightlifeEnabled, scanTicket }: { headers: Record<string, string>; billingEnabled: boolean; openInvoice: (id: string) => void; money: (value:number)=>string; restaurantEnabled: boolean; openTables: () => void; hotelEnabled: boolean; nightlifeEnabled: boolean; scanTicket:(eventId?:string)=>Promise<void> }) {
  const [data, setData] = useState<Data>(empty)
  const [tab, setTab] = useState<'hotel' | 'nightlife'>('hotel')
  const activeTab = hotelEnabled && (tab === 'hotel' || !nightlifeEnabled) ? 'hotel' : 'nightlife'
  const [calendarMonth, setCalendarMonth] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` })
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
      const result = await posRequest('/api/pos/hospitality/invoice', headers, { id: 'service-job:' + crypto.randomUUID(), commandId: crypto.randomUUID(), expectedUpdatedAt: '', estimate: false, ...(record.customerId?{customerId:record.customerId}:{}), hospitality: { recordId: record.id, recordKind: record.kind } })
      await reload()
      window.dispatchEvent(new Event('stockroom-data-refreshed'))
      openInvoice(result.job.id)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the invoice.') }
  }
  async function createFolioCharge(record: RecordRow, description: string, quantity: number, price: number): Promise<boolean> {
    setError('')
    try {
      const result = await posRequest('/api/pos/hospitality/invoice', headers, { id: 'service-job:' + crypto.randomUUID(), commandId: crypto.randomUUID(), expectedUpdatedAt: '', estimate: false, ...(record.customerId?{customerId:record.customerId}:{}), title: `Hotel folio - ${record.roomName}`, lines: [{ id: 'folio:' + crypto.randomUUID(), description, quantity, price }], hospitality: { recordId: record.id, recordKind: record.kind, chargeType: 'extra' } })
      await reload()
      window.dispatchEvent(new Event('stockroom-data-refreshed'))
      openInvoice(result.job.id)
      return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add the guest folio charge.'); return false }
  }
  async function createFolioStockCharge(record: RecordRow, productId:string, quantity:number): Promise<boolean> {
    setError('')
    try {
      const result = await posRequest('/api/pos/hospitality/invoice', headers, { id:'service-job:'+crypto.randomUUID(), commandId:crypto.randomUUID(), expectedUpdatedAt:'', estimate:false, ...(record.customerId?{customerId:record.customerId}:{}), hospitalityStock:{productId,quantity}, hospitality:{recordId:record.id,recordKind:record.kind,chargeType:'extra'} })
      await reload(); window.dispatchEvent(new Event('stockroom-data-refreshed')); openInvoice(result.job.id); return true
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not charge this stocked product to the guest folio.'); return false }
  }
  const invoicesFor = (id: string) => data.invoices.filter(job => job.hospitality?.recordId === id)
  const invoiceFor = (id: string) => data.invoices.find(job => job.hospitality?.recordId === id)
  const invoiceStatus = (job?: Invoice) => job ? <><p>{job.status === 'cancelled' ? 'Invoice cancelled' : `Invoice total: ${money(job.pricing.total)} · Paid: ${money(job.balance.paid)} · Due: ${money(job.balance.due)}`}</p><button type="button" className="filter-button" onClick={() => openInvoice(job.id)}>{job.status === 'cancelled' ? 'View cancelled invoice' : job.balance.due > 0 ? 'Open invoice and record payment' : 'View invoice and receipts'}</button></> : null
  const [year, month] = calendarMonth.split('-').map(Number)
  const monthStart = Date.UTC(year, month - 1, 1)
  const monthDays = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const nextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10)
  const rooms = [...new Set([...data.rooms.map(row => row.roomName), ...data.stays.map(row => row.roomName)])].sort((a, b) => a.localeCompare(b))
  const monthStays = (roomName: string): (RecordRow & { startDay: number; endDay: number })[] => data.stays.filter(row => row.roomName === roomName && row.status !== 'cancelled' && row.checkIn < nextMonth && row.checkOut > `${calendarMonth}-01`).map(row => {
    const startDay = Math.max(1, Math.floor((Date.parse(`${row.checkIn}T00:00:00Z`) - monthStart) / 86400000) + 1)
    const endDay = Math.min(monthDays + 1, Math.floor((Date.parse(`${row.checkOut}T00:00:00Z`) - monthStart) / 86400000) + 1)
    return { ...row, startDay, endDay } as RecordRow & { startDay: number; endDay: number }
  })

  return <section className="panel hospitality-operations">
    <h2>Hospitality operations</h2>
    <p>{hotelEnabled && nightlifeEnabled ? 'Hotel charges and nightlife admission invoices' : hotelEnabled ? 'Hotel charges' : 'Nightlife admission invoices'} use Jobs &amp; invoices. Partial payments are recorded as deposits, with a receipt for each payment.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {hotelEnabled && nightlifeEnabled && <nav className="counter-tabs" aria-label="Hospitality operation type">
      <button type="button" className={tab === 'hotel' ? 'primary-button' : 'filter-button'} onClick={() => setTab('hotel')}>Hotel stays</button>
      <button type="button" className={tab === 'nightlife' ? 'primary-button' : 'filter-button'} onClick={() => setTab('nightlife')}>Nightlife events</button>
    </nav>}

    {activeTab === 'hotel' && hotelEnabled ? <>
      <h3>Room register</h3>
      <AsyncForm className="form-grid" onSubmit={async event => {
        const form = event.currentTarget, fields = new FormData(form)
        if(await act({ action: 'add-room', roomName: String(fields.get('room')), nightlyRate: Number(fields.get('rate')) })) form.reset()
      }}>
        <label>Room name or number<input name="room" required maxLength={80} /></label><label>Nightly rate<input name="rate" type="number" min="0.01" step="0.01" required /></label>
        <SubmitButton className="primary-button">Add room</SubmitButton>
      </AsyncForm>
      {data.rooms.map(room => <article className="customer-row" key={room.id}><div><strong>{room.roomName}</strong><small>{money(room.nightlyRate)} per night · {room.status} · Housekeeping: {room.housekeepingStatus||'ready'}{room.housekeepingAssignedTo?` · Assigned to ${data.housekeepingStaff.find(member=>member.id===room.housekeepingAssignedTo)?.name||'staff member'}`:''}{room.housekeepingScheduledAt?` · Scheduled ${new Date(room.housekeepingScheduledAt).toLocaleString()}`:''}</small></div><AsyncForm className="form-grid" onSubmit={async event => { const fields = new FormData(event.currentTarget), scheduled=String(fields.get('housekeepingScheduledAt')||''); await act({ action: 'update-room', id: room.id, expectedUpdatedAt: room.updatedAt, status: String(fields.get('status')), housekeepingStatus: String(fields.get('housekeepingStatus')), housekeepingAssignedTo:String(fields.get('housekeepingAssignedTo')||''),housekeepingScheduledAt:dateTimeInputIso(scheduled),nightlyRate: Number(fields.get('rate')) }) }}><label>Nightly rate<input name="rate" type="number" min="0.01" step="0.01" defaultValue={room.nightlyRate} required /></label><label>Room status<select name="status" defaultValue={room.status}><option value="active">Available</option><option value="maintenance">Maintenance</option><option value="inactive">Inactive</option></select></label><label>Housekeeping<select name="housekeepingStatus" defaultValue={room.housekeepingStatus||'ready'}><option value="ready">Ready for check-in</option><option value="dirty">Needs cleaning</option><option value="cleaning">Cleaning in progress</option></select></label><label>Assign housekeeping staff<select name="housekeepingAssignedTo" defaultValue={room.housekeepingAssignedTo||''}><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Cleaning schedule<input name="housekeepingScheduledAt" type="datetime-local" defaultValue={localDateTimeValue(room.housekeepingScheduledAt)}/></label><SubmitButton className="filter-button">Save room and housekeeping</SubmitButton></AsyncForm></article>)}
      <h3>Book a stay</h3>
      <AsyncForm className="form-grid" onSubmit={async event => {
        const form = event.currentTarget, fields = new FormData(form)
        const room = data.rooms.find(row => row.id === String(fields.get('roomId')))
        if(!room) { setError('Add and select an active room before booking a stay.'); return }
        if(await act({ action: 'book-stay', roomId: room.id, guestName: String(fields.get('guest')), guestPhone: String(fields.get('phone')), checkIn: String(fields.get('checkin')), checkOut: String(fields.get('checkout')), note: String(fields.get('note')), assignedStaffId:String(fields.get('assignedStaffId')||'') })) form.reset()
      }}>
        <label>Room<select name="roomId" required defaultValue=""><option value="" disabled>{data.rooms.some(room => room.status === 'active') ? 'Choose an available room' : 'Add an active room first'}</option>{data.rooms.filter(room => room.status === 'active').map(room => <option key={room.id} value={room.id}>{room.roomName} · {money(room.nightlyRate)} / night</option>)}</select></label><label>Guest name<input name="guest" required maxLength={200} /></label>
        <label>Phone<input name="phone" maxLength={80} /></label><label>Check in<input type="date" name="checkin" required /></label>
        <label>Check out<input type="date" name="checkout" required /></label>
        <label>Notes<input name="note" maxLength={500} /></label><label>Stay manager<select name="assignedStaffId" defaultValue=""><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><SubmitButton className="primary-button">Save booking</SubmitButton>
      </AsyncForm>
      <h3>Room stays</h3>
      <section className="panel" aria-label="Room availability calendar">
        <div className="report-actions"><h3>Room availability</h3><label>Month<input type="month" value={calendarMonth} onChange={event => setCalendarMonth(event.target.value)} /></label></div>
        {rooms.length ? <div style={{ overflowX: 'auto' }}><div style={{ minWidth: `${Math.max(720, monthDays * 28 + 150)}px` }}>
          <div style={{ display: 'grid', gridTemplateColumns: `150px repeat(${monthDays}, minmax(22px, 1fr))`, alignItems: 'center', textAlign: 'center' }}><strong style={{ textAlign: 'left' }}>Room</strong>{Array.from({ length: monthDays }, (_, index) => <small key={index + 1}>{index + 1}</small>)}</div>
          {rooms.map(room => <div key={room} style={{ display: 'grid', gridTemplateColumns: `150px repeat(${monthDays}, minmax(22px, 1fr))`, minHeight: 42, alignItems: 'stretch', borderTop: '1px solid var(--border-color, #3b4b60)' }}><strong style={{ alignSelf: 'center', paddingRight: 8 }}>{room}</strong>{monthStays(room).map(stay => <span key={stay.id} className="filter-button" title={`${stay.guestName}: ${stay.checkIn} to ${stay.checkOut}`} style={{ gridColumn: `${stay.startDay + 1} / ${stay.endDay + 1}`, gridRow: 1, alignSelf: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stay.guestName} · {stay.status}</span>)}</div>)}
        </div></div> : <p>No room bookings overlap this month.</p>}
      </section>
      {data.stays.length ? data.stays.map(row => {
        const invoices = invoicesFor(row.id), invoice = invoices.find(job => !job.hospitality.chargeType), room=data.rooms.find(item=>item.id===row.roomId), roomReady=!room||(room.housekeepingStatus||'ready')==='ready'
        return <article className="customer-row" key={row.id}><div><strong>{row.roomName} · {row.guestName}</strong><small>{row.checkIn} to {row.checkOut} · {row.status} · {row.guestPhone}</small>{row.status==='booked'&&room&&!roomReady&&<small>Check-in is paused until housekeeping marks the room ready ({room.housekeepingStatus}).</small>}
          {invoices.map(job => <div key={job.id}><small>{job.hospitality.chargeType === 'extra' ? `Guest folio · ${job.title}` : 'Accommodation'}</small>{invoiceStatus(job)}</div>)}
          {(!invoice || invoice.status === 'cancelled') && row.nightlyRate > 0 && billingEnabled && <button type="button" className="filter-button" onClick={() => void createInvoice(row)}>{invoice ? 'Create replacement stay invoice' : 'Create stay invoice'}</button>}
          {!invoice && row.nightlyRate > 0 && !billingEnabled && <small>Enable Payments &amp; receipts and grant Jobs &amp; invoices access to bill this stay.</small>}
          {row.status === 'checked-in' && billingEnabled && <AsyncForm className="form-grid" onSubmit={async event => { const form = event.currentTarget, fields = new FormData(form); if(await createFolioCharge(row, String(fields.get('description')), Number(fields.get('quantity')), Number(fields.get('price')))) form.reset() }}><label>Extra charge<input name="description" required maxLength={150} placeholder="Room service, laundry…" /></label><label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label><label>Unit price<input name="price" type="number" min="0.01" step="0.01" required /></label><SubmitButton className="filter-button">Add to guest folio</SubmitButton></AsyncForm>}
          {row.status === 'checked-in' && billingEnabled && <AsyncForm className="form-grid" onSubmit={async event => { const form=event.currentTarget,fields=new FormData(form);if(await createFolioStockCharge(row,String(fields.get('productId')),Number(fields.get('quantity'))))form.reset() }}><label>Stocked product<select name="productId" required defaultValue=""><option value="">Choose stocked product</option>{data.stockItems.filter(item=>item.stock>0).map(item=><option key={item.id} value={item.id}>{item.name} · {item.stock} {item.unit} available · {money(item.price)} / {item.unit}</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="0.001" step="0.001" defaultValue="1" required /></label><SubmitButton className="filter-button" disabled={!data.stockItems.some(item=>item.stock>0)}>Charge product and deduct stock</SubmitButton><small>Uses the saved product price. Stock is deducted when this folio invoice is created; payment can be collected later through Jobs &amp; invoices.</small></AsyncForm>}
          {!row.nightlyRate && <small>No nightly rate is saved for this booking.</small>}
        </div>
          {row.status === 'booked' && <><AsyncButton className="filter-button" disabled={!roomReady} onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'checked-in' }) }}>Check in</AsyncButton>{row.checkInToken&&<AsyncButton className="filter-button" disabled={!roomReady} onClick={()=>void scanTicket()}>Scan guest QR</AsyncButton>}</>}
          {row.status === 'checked-in' && <AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'checked-out' }) }}>Check out</AsyncButton>}
          {row.status === 'booked' && <AsyncButton className="filter-button" onClick={() => { void act({ action: 'status', id: row.id, expectedUpdatedAt: row.updatedAt, status: 'cancelled' }) }}>Cancel</AsyncButton>}
        </article>
      }) : <p>No stays booked.</p>}
    </> : nightlifeEnabled ? <>
      <h3>Create an event</h3>
      {restaurantEnabled ? <section className="panel"><h3>Venue tables and tabs</h3><p>Use the existing table reservations, open tabs, menu orders and settlement for this venue.</p><button type="button" className="primary-button" onClick={openTables}>Open venue tables &amp; tabs</button></section> : <p>Enable the existing Tables &amp; tabs workspace in business setup to manage venue reservations, orders and tabs.</p>}
      <AsyncForm className="form-grid" onSubmit={async event => {
        const form = event.currentTarget, fields = new FormData(form)
        if(await act({ action: 'create-event', name: String(fields.get('name')), startsAt: new Date(String(fields.get('startsAt'))).toISOString(), capacity: Number(fields.get('capacity')), admissionPrice: Number(fields.get('admissionPrice')), hostStaffId:String(fields.get('hostStaffId')||''), doorStaffId:String(fields.get('doorStaffId')||'') })) form.reset()
      }}>
        <label>Event name<input name="name" required maxLength={200} /></label><label>Starts<input type="datetime-local" name="startsAt" required /></label>
        <label>Guest capacity<input type="number" name="capacity" min="0" max="100000" defaultValue="0" /></label>
        <label>Admission price<input type="number" name="admissionPrice" min="0" step="0.01" defaultValue="0" required /></label>
        <label>Event host<select name="hostStaffId" defaultValue=""><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <label>Door staff lead<select name="doorStaffId" defaultValue=""><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
        <SubmitButton className="primary-button">Create event</SubmitButton>
      </AsyncForm>
      <h3>Events and guest list</h3>
      {data.events.map(event => <article className="panel" key={event.id}>
        <strong>{event.name}</strong><p>{new Date(event.startsAt).toLocaleString()} · {data.entries.filter(row => row.eventId === event.id && row.status !== 'cancelled').length}{event.capacity ? ` / ${event.capacity}` : ''} guests · Admission {money(event.admissionPrice || 0)} · {event.status}</p>
        <AsyncButton className="filter-button" onClick={()=>void scanTicket(event.id)}>Scan admission QR</AsyncButton>
        <AsyncForm className="form-grid" onSubmit={async formEvent=>{const fields=new FormData(formEvent.currentTarget);await act({action:'assign-event-staff',id:event.id,expectedUpdatedAt:event.updatedAt,hostStaffId:String(fields.get('hostStaffId')||''),doorStaffId:String(fields.get('doorStaffId')||'')})}}><label>Event host<select name="hostStaffId" defaultValue={event.staffAssignments?.host||''}><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Door staff lead<select name="doorStaffId" defaultValue={event.staffAssignments?.door||''}><option value="">Unassigned</option>{data.housekeepingStaff.map(member=><option key={member.id} value={member.id}>{member.name}</option>)}</select></label><SubmitButton className="filter-button">Save staff assignments</SubmitButton></AsyncForm>
        {(data.tableReservations.some(row=>row.nightlifeEventId===event.id)||data.venueTabs.some(row=>row.nightlifeEventId===event.id))&&<section className="panel" aria-label={`${event.name} venue bookings`}><h4>Venue table bookings and tabs</h4>{data.tableReservations.filter(row=>row.nightlifeEventId===event.id).map(row=><p key={row.id}>{row.name} · {row.guests} guests · {row.tableName||'Unassigned'} · {new Date(row.startAt).toLocaleString()} · {row.status}</p>)}{data.venueTabs.filter(row=>row.nightlifeEventId===event.id).map(row=><p key={row.id}>Open tab: {row.name} · {row.guests} guests · {row.sessionId.slice(0,8).toUpperCase()}</p>)}</section>}
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
    </> : null}
  </section>
}
