import type { CSSProperties } from 'react'

export type ChartRow = { label: string; value: number }
export type ReportChartData = { daily: ChartRow[]; payments: ChartRow[]; products: ChartRow[]; expenses: ChartRow[] }

const colors = ['#176b73', '#7256b8', '#d68130', '#34865e', '#c15379', '#487cb8']

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
    <div className="report-chart-heading"><div><h3>Sales by day</h3><p>Net sales after refunds, by business date.</p></div><span className="chart-period">Month to date</span></div>
    {!rows.length || rows.every(row => row.value === 0) ? <p className="chart-empty">No sales recorded this month yet.</p> : <>
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
    {!positive.length ? <p className="chart-empty">Payment breakdown appears after the first sale.</p> : <>
      <div className="chart-pie-layout"><div className="chart-doughnut" role="img" aria-label={`${positive.map(row => `${row.label}: ${format(row.value)}`).join('; ')}. Total ${format(total)}.`} style={{ background: `conic-gradient(${slices.join(',')})` }}><span><small>Total sales</small><strong>{format(total)}</strong></span></div>
        <ul>{positive.map((row, index) => <li key={row.label}><i style={{ background: colors[index % colors.length] }} aria-hidden="true"/><span>{row.label}</span><strong>{(row.value / total * 100).toFixed(0)}%</strong></li>)}</ul>
      </div><DataTable rows={rows} format={format} pie />
    </>}
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

export function ReportCharts({ data, currency, timeZone, error = '', onRetry }: { data?: ReportChartData; currency: string; timeZone: string; error?: string; onRetry?: () => void }) {
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(value)
  if (!data) return <section className="report-visuals" aria-label="Report charts">{error ? <p role="alert">{error} {onRetry && <button type="button" className="filter-button" onClick={onRetry}>Retry reports</button>}</p> : <p role="status">Report charts are loading.</p>}</section>
  return <section className="report-visuals" aria-label="Business report charts">
    <div className="chart-heading"><div><span className="report-eyebrow">BUSINESS REPORT</span><h2>Month to date</h2><p>Daily activity · {timeZone}</p></div></div>
    <div className="report-chart-grid"><DailySales rows={data.daily} format={money}/><PaymentMix rows={data.payments} format={money}/><RankingChart title="Top-selling products" description="Units sold after returns." rows={data.products} format={value => value.toLocaleString()} emptyText="Product sales will appear here."/><RankingChart title="Expenses by category" description="Expenses recorded this month." rows={data.expenses} format={money} emptyText="Recorded expenses will appear here."/></div>
  </section>
}
