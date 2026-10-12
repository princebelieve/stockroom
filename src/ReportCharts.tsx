import { useEffect, useMemo, useState, type CSSProperties } from 'react'

export type ChartRow = { label: string; value: number }
export type ReportChartData = { from?: string; to?: string; daily: ChartRow[]; payments: ChartRow[]; products: ChartRow[]; expenses: ChartRow[] }

const colors = ['#176b73', '#7256b8', '#d68130', '#34865e', '#c15379', '#487cb8']

function businessToday(timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const get = (type: string) => parts.find(part => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function rangeFor(period: string, today: string) {
  if (period === 'month') return { from: `${today.slice(0, 7)}-01`, to: today }
  const count = Number(period)
  return { from: shiftDate(today, -(count - 1)), to: today }
}

function rangeLabel(from: string, to: string, timeZone: string) {
  const format = (value: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`))
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const dates = sameMonth
    ? `${format(from, { month: 'long' })} ${format(from, { day: 'numeric' })}–${format(to, { day: 'numeric', year: 'numeric' })}`
    : `${format(from, { month: 'short', day: 'numeric', year: 'numeric' })} – ${format(to, { month: 'short', day: 'numeric', year: 'numeric' })}`
  const city = timeZone.split('/').at(-1)?.replaceAll('_', ' ') || 'business'
  return `${dates} · ${city} time`
}

function DataTable({ rows, format, pie = false }: { rows: ChartRow[]; format: (value: number) => string; pie?: boolean }) {
  const total = rows.filter(row => row.value > 0).reduce((sum, row) => sum + row.value, 0)
  return <details className="chart-data"><summary>View data table</summary><div className="table-wrap"><table><thead><tr><th>Label</th><th>Value</th>{pie && <th>Share</th>}</tr></thead><tbody>{rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{format(row.value)}</td>{pie && <td>{total > 0 && row.value > 0 ? `${(row.value / total * 100).toFixed(1)}%` : '—'}</td>}</tr>)}</tbody></table></div></details>
}

function DailySales({ rows, format }: { rows: ChartRow[]; format: (value: number) => string }) {
  const positiveMax = Math.max(1, ...rows.map(row => row.value))
  const negativeMax = Math.max(1, ...rows.map(row => Math.abs(Math.min(0, row.value))))
  const hasNegative = rows.some(row => row.value < 0)
  const baseline = hasNegative ? 74 : 88
  return <section className="panel report-chart report-chart-daily">
    <div className="report-chart-heading"><div><h3>Sales by day</h3><p>Net sales after refunds, by business date.</p></div></div>
    {!rows.length || rows.every(row => row.value === 0) ? <p className="chart-empty">No sales in this date range.</p> : <>
      <div className="daily-sales-chart" role="img" aria-label={`Daily net sales: ${rows.map(row => `${row.label}: ${format(row.value)}`).join('; ')}`}>
        <div className="daily-sales-bars" style={{ '--bar-baseline': `${baseline}%` } as CSSProperties & { '--bar-baseline': string }}>{rows.map((row, index) => {
          const negative = row.value < 0
          const height = negative ? Math.max(2, Math.abs(row.value) / negativeMax * 18) : row.value > 0 ? Math.max(2, row.value / positiveMax * (baseline - 8)) : 0
          const day = row.label.slice(-2).replace(/^0/, '')
          const showDay = index === 0 || (index + 1) % 5 === 0 || index === rows.length - 1
          return <div className="daily-sales-column" key={row.label} title={`${row.label}: ${format(row.value)}`}><i className={negative ? 'daily-sales-bar negative' : 'daily-sales-bar'} style={{ '--bar-height': `${height}%` } as CSSProperties & { '--bar-height': string }} />{showDay && <span>{day}</span>}</div>
        })}</div>
      </div>
      <div className="chart-legend"><span><i aria-hidden="true" />Daily net sales</span>{hasNegative && <span><i className="legend-negative" aria-hidden="true" />Net refunds</span>}</div>
      <DataTable rows={rows} format={format} />
    </>}
  </section>
}

function PaymentMix({ rows, format }: { rows: ChartRow[]; format: (value: number) => string }) {
  const positive = rows.filter(row => row.value > 0)
  const total = positive.reduce((sum, row) => sum + row.value, 0)
  let end = 0
  const slices = positive.map((row, index) => { const start = end; end += row.value / total * 360; return `${colors[index % colors.length]} ${start}deg ${end}deg` })
  return <section className="panel report-chart report-chart-payments">
    <div className="report-chart-heading"><div><h3>Payment methods</h3><p>Completed sales before refunds.</p></div></div>
    <div className="chart-pie-layout"><div className={`chart-doughnut${positive.length ? '' : ' chart-doughnut-empty'}`} role="img" aria-label={positive.length ? `${positive.map(row => `${row.label}: ${format(row.value)}`).join('; ')}. Total ${format(total)}.` : 'No payments in this date range. Total zero.'} style={{ background: positive.length ? `conic-gradient(${slices.join(',')})` : undefined }}><span><small>{positive.length ? 'Sales total' : 'No sales yet'}</small><strong>{format(total)}</strong></span></div>
      {positive.length ? <ul>{positive.map((row, index) => <li key={row.label}><i style={{ background: colors[index % colors.length] }} aria-hidden="true"/><span>{row.label}</span><strong>{(row.value / total * 100).toFixed(0)}%</strong></li>)}</ul> : <p className="chart-empty">No completed sales in this date range. Choose another period to review activity.</p>}
    </div>{positive.length > 0 && <DataTable rows={rows} format={format} pie />}
  </section>
}

function RankingChart({ title, description, rows, format, emptyText }: { title: string; description: string; rows: ChartRow[]; format: (value: number) => string; emptyText: string }) {
  const max = Math.max(1, ...rows.map(row => Math.abs(row.value)))
  return <section className="panel report-chart report-chart-ranking"><div className="report-chart-heading"><div><h3>{title}</h3><p>{description}</p></div></div>
    {!rows.length || rows.every(row => row.value === 0) ? <p className="chart-empty">{emptyText}</p> : <>
      <div className="chart-bars" role="img" aria-label={`${title}: ${rows.map(row => `${row.label}: ${format(row.value)}`).join('; ')}`}>{rows.map((row, index) => <div className="chart-bar-row" key={row.label}><span title={row.label}>{row.label}</span><div className="chart-bar-track"><i style={{ width: `${Math.abs(row.value) / max * 100}%`, background: colors[index % colors.length] }} /></div><strong>{format(row.value)}</strong></div>)}</div><DataTable rows={rows} format={format} />
    </>}
  </section>
}

export function ReportCharts({ data, currency, timeZone, headers, error = '', onRetry }: { data?: ReportChartData; currency: string; timeZone: string; headers: Record<string, string>; error?: string; onRetry?: () => void }) {
  const today = useMemo(() => businessToday(timeZone), [timeZone])
  const [period, setPeriod] = useState('month')
  const [range, setRange] = useState(() => ({ from: `${today.slice(0, 7)}-01`, to: today }))
  const [chartData, setChartData] = useState(data)
  const [loading, setLoading] = useState(false)
  const [rangeError, setRangeError] = useState('')
  const headerKey = JSON.stringify(headers)

  useEffect(() => { if (period === 'month' && data) setChartData(data) }, [data, period])
  useEffect(() => {
    if (period === 'month') return
    if (!range.from || !range.to || range.from > range.to) { setRangeError('Choose a start date on or before the end date.'); return }
    if ((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000 > 365) { setRangeError('Choose a date range of up to one year.'); return }
    let live = true
    const requestHeaders = new Headers(JSON.parse(headerKey) as Record<string, string>)
    requestHeaders.set('X-Report-From', range.from)
    requestHeaders.set('X-Report-To', range.to)
    setLoading(true)
    setRangeError('')
    fetch('/api/reports', { headers: requestHeaders }).then(async response => {
      const result = await response.json().catch(() => ({})) as { charts?: ReportChartData; error?: string }
      if (!response.ok || !result.charts) throw new Error(result.error || 'Could not load this report date range.')
      if (live) setChartData(result.charts)
    }).catch(reason => { if (live) setRangeError(reason instanceof Error ? reason.message : 'Could not load this report date range.') }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [period, range.from, range.to, headerKey])

  const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  const selectPeriod = (value: string) => {
    setPeriod(value)
    if (value !== 'custom') setRange(rangeFor(value, today))
    else if (period !== 'custom') setRange({ from: `${today.slice(0, 7)}-01`, to: today })
  }
  if (!chartData) return <section className="report-visuals" aria-label="Report charts">{error ? <p role="alert">{error} {onRetry && <button type="button" className="filter-button" onClick={onRetry}>Retry reports</button>}</p> : <p role="status">Report charts are loading.</p>}</section>
  return <section className="report-visuals" aria-label="Business report charts">
    <div className="chart-heading report-chart-controls"><div><span className="report-eyebrow">SALES ACTIVITY</span><h2>{rangeLabel(range.from, range.to, timeZone)}</h2></div><div className="report-range-controls"><label className="sr-only" htmlFor="report-period">Report date range</label><select id="report-period" value={period} onChange={event => selectPeriod(event.target.value)}><option value="month">This month</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom dates</option></select>{period === 'custom' && <><label><span>From</span><input type="date" value={range.from} max={range.to || today} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label><label><span>To</span><input type="date" value={range.to} max={today} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label></>}</div></div>
    {rangeError && <p className="auth-error" role="alert">{rangeError}</p>}{loading && <p className="report-range-status" role="status">Updating report…</p>}
    <div className="report-chart-grid"><DailySales rows={chartData.daily} format={money}/><PaymentMix rows={chartData.payments} format={money}/><RankingChart title="Top-selling products" description="Units sold after returns." rows={chartData.products} format={value => value.toLocaleString()} emptyText="No product sales in this date range."/><RankingChart title="Expenses by category" description="Expenses recorded in this date range." rows={chartData.expenses} format={money} emptyText="No recorded expenses in this date range."/></div>
  </section>
}
