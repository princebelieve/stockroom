import { useEffect, useState, type ReactNode } from 'react'
import { Download } from 'lucide-react'
import { TaskPicker, type TaskOption } from './TaskPicker'
import { WorkspaceHelp } from './WorkspaceHelp'

type StockReportData = {
  reportingTimeZone?: string
  profit: { revenue: number; amount: number }
  supermarket: {
    costValue: number; purchases: number; wastage: number; stockLoss: number
    cashShortage: number; cashSurplus: number; tax: number; zeroCostSaleLines: number
    suppliers: { id: string; name: string; balance: number }[]
    outstanding: { orderId: string; reference: string; productName: string; quantity: number }[]
    bestSellers: { productName: string; quantity: number }[]
    expired: { id: string; batch_number?: string; product_id: string; quantity: number; expiry: string }[]
  }
}

const reportTasks: TaskOption[] = [
  { id: 'overview', label: 'Stock overview', hint: 'Review current stock value and this month’s operating totals.' },
  { id: 'suppliers', label: 'Suppliers & deliveries', hint: 'Review supplier balances and outstanding deliveries.' },
  { id: 'products', label: 'Product performance', hint: 'Review best sellers and expired batches.' },
]

export function StockReport({ headers, branchId, money, revision }: { headers: Record<string, string>; branchId: string; money: (n: number) => string; revision?: unknown }) {
  const [data, setData] = useState<StockReportData | null>(null)
  const [error, setError] = useState('')
  const [task, setTask] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    fetch('/api/reports', { headers }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load the stock report.')
      if (active) setData(result)
    }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not load the stock report.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [branchId, headers.Authorization, headers['X-Stockroom-Branch'], revision, retry])

  function exportReport() {
    if (!data?.supermarket) return
    const report = data.supermarket
    const rows: unknown[][] = [['Metric', 'Value'], ['Inventory at purchase cost', report.costValue], ['Month net purchases', report.purchases], ['Month wastage', report.wastage], ['Month stock shortages', report.stockLoss], ['Month cash shortages', report.cashShortage], ['Month cash surplus', report.cashSurplus], ['Month tax', report.tax], ['Month net revenue', data.profit.revenue], ['Month profit', data.profit.amount], ...report.bestSellers.map(row => [row.productName, row.quantity])]
    const csv = rows.map(row => row.map(value => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'stock-report.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  if (loading && !data) return <section className="stock-report-screen" role="status">Loading stock report…</section>
  if (error && !data) return <section className="stock-report-screen"><p role="alert">{error}</p><button type="button" className="filter-button" onClick={() => setRetry(value => value + 1)}>Retry report</button></section>
  if (!data?.supermarket) return <section className="stock-report-screen"><p role="status">Stock report data is not available for this branch.</p></section>

  const report = data.supermarket
  const period = new Intl.DateTimeFormat(undefined, { month: 'long', timeZone: data.reportingTimeZone || 'UTC' }).format(new Date())
  return <section className="stock-report-screen" aria-label="Stock report">
    <div className="stock-report-context"><p><span className="report-eyebrow">STOCK &amp; PURCHASING</span><br/>{period} · {data.reportingTimeZone?.split('/').at(-1)?.replaceAll('_', ' ') || 'business'} time</p><button type="button" className="filter-button" onClick={exportReport}><Download size={16}/>Export report</button></div>
    {error && <p role="alert" className="auth-error">Some report data may be out of date: {error}</p>}
    <TaskPicker scope="Stock report" items={reportTasks} value={task} onChange={setTask}/>

    {task === 'overview' && <>
      {report.zeroCostSaleLines > 0 && <div className="stock-report-alert" role="status"><strong>{report.zeroCostSaleLines} sold product lines have no recorded cost.</strong><span>Review purchase costs before relying on the profit estimate.</span></div>}
      <div className="metric-grid stock-report-metrics" aria-label="Stock and purchasing totals">
        <ReportMetric label="Current stock at cost" value={money(report.costValue)} note="Recorded purchase cost" />
        <ReportMetric label="Purchases this month" value={money(report.purchases)} note="Net supplier receipts" />
        <ReportMetric label="Wastage this month" value={money(report.wastage)} note="Recorded stock wastage" />
        <ReportMetric label="Stock shortages" value={money(report.stockLoss)} note="This month" />
        <ReportMetric label="Cash shortage" value={money(report.cashShortage)} note="This month" />
        <ReportMetric label="Estimated profit" value={money(data.profit.amount)} note={`${money(data.profit.revenue)} net revenue this month`} />
      </div>
      <WorkspaceHelp title="About these figures"><p>Stock value uses recorded purchase costs. Estimated profit deducts stock cost, tax, expenses, wastage and shortages. Missing purchase costs can make it inaccurate.</p></WorkspaceHelp>
    </>}

    {task === 'suppliers' && <div className="stock-report-columns">
      <ReportList title="Supplier balances" empty="No supplier balances to show.">
        {report.suppliers.map(row => <div className="stock-report-row" key={row.id}><span>{row.name}</span><strong>{money(Math.abs(row.balance))}<small>{row.balance < 0 ? 'Credit' : 'Owed'}</small></strong></div>)}
      </ReportList>
      <ReportList title="Outstanding deliveries" empty="No outstanding deliveries.">
        {report.outstanding.map(row => <div className="stock-report-row" key={`${row.orderId}:${row.productName}`}><span>{row.productName}<small>{row.reference}</small></span><strong>{row.quantity}<small>remaining</small></strong></div>)}
      </ReportList>
    </div>}

    {task === 'products' && <div className="stock-report-columns">
      <ReportList title="Best-selling products this month" empty="Product sales will appear here.">
        {report.bestSellers.map((row, index) => <div className="stock-report-row" key={row.productName}><span><i className="stock-report-rank">{index + 1}</i>{row.productName}</span><strong>{row.quantity}<small>units</small></strong></div>)}
      </ReportList>
      <ReportList title="Expired stock" empty="No recorded expired stock.">
        {report.expired.map(row => <div className="stock-report-row" key={row.id}><span>{row.batch_number || row.product_id}<small>Expired {row.expiry}</small></span><strong>{row.quantity}<small>units</small></strong></div>)}
      </ReportList>
    </div>}
  </section>
}

function ReportMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}

function ReportList({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0)
  return <section className="panel stock-report-list"><h3>{title}</h3>{isEmpty ? <p className="stock-report-empty">{empty}</p> : <div>{children}</div>}</section>
}
