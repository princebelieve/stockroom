import { printerSettings } from './printing'
import type { CounterOrder } from '../CounterService'

export type PreparationJob = { id: string; station: 'kitchen' | 'bar'; order: CounterOrder; state: 'pending' | 'submitted' | 'failed'; error?: string }
const key = (scope: string) => `stockroom-preparation-jobs:${scope}`
export function preparationJobs(scope: string): PreparationJob[] {
  try { const jobs = JSON.parse(localStorage.getItem(key(scope)) || '[]'); return Array.isArray(jobs) ? jobs : [] } catch { return [] }
}
function save(scope: string, jobs: PreparationJob[]) {
  // Keep unresolved jobs and recent submitted jobs for retry deduplication.
  localStorage.setItem(key(scope), JSON.stringify([...jobs.filter(job => job.state !== 'submitted'), ...jobs.filter(job => job.state === 'submitted').slice(-500)]))
}
async function locked<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks ? navigator.locks.request('stockroom-preparation-print', work) : work()
}
export async function routePreparation(scope: string, order: CounterOrder, print: (order: CounterOrder, station?: 'kitchen' | 'bar') => Promise<void>, previous?: CounterOrder) {
  if (!printerSettings().automaticPreparation || !window.stockroomDesktop) return
  const token = localStorage.getItem('stockroom-token')
  if (token) {
    const response = await fetch('/api/preparation-print/jobs', { headers: { Authorization: `Bearer ${token}`, 'X-Stockroom-Branch': scope.split(':').at(-1) || 'main' } })
    if (!response.ok && response.status !== 404) throw new Error('Check shared printer routing before printing locally. The order is saved.')
    if (response.ok) {
      const shared = Boolean((await response.json()).shared)
      localStorage.setItem('stockroom-shared-print:' + scope, JSON.stringify(shared))
      if (shared) return
    }
  } else if (localStorage.getItem('stockroom-shared-print:' + scope) === 'true') return
  await locked(async () => {
    const jobs = preparationJobs(scope)
    const stations = [...new Set([...order.lines, ...(order.changeReason ? previous?.lines || [] : [])].map(line => line.station || 'kitchen'))]
    const submitted = [...(order.events || [])].reverse().find(event => ['create', 'edit', 'accept'].includes(event.action || ''))
    const revision = order.status === 'cancelled' ? order.updatedAt : submitted?.at || order.updatedAt
    const added: PreparationJob[] = []
    for (const station of stations) {
      const id = `${order.id}:${revision}:${station}`
      if (jobs.some(job => job.id === id)) continue
      const remaining = order.lines.filter(line => (line.station || 'kitchen') === station)
      const ticket = { ...order, note: [order.status === 'cancelled' || !remaining.length ? 'CANCEL STATION ITEMS' : order.changeReason ? 'ORDER CORRECTION: replace the earlier station ticket' : '', order.note].filter(Boolean).join(' / '), lines: remaining.length ? remaining : (previous?.lines || []).filter(line => (line.station || 'kitchen') === station) }
      const job: PreparationJob = { id, station, order: ticket, state: 'pending' }
      jobs.push(job); added.push(job)
    }
    save(scope, jobs)
    for (const job of added) {
      try {
        if (!printerSettings()[job.station]) throw new Error(`Select an installed ${job.station} printer in Device settings.`)
        await print(job.order, job.station)
        job.state = 'submitted'
      } catch (error) { job.state = 'failed'; job.error = error instanceof Error ? error.message : 'Printing failed.' }
      save(scope, jobs)
    }
  })
}
export async function retryPreparation(scope: string, id: string, print: (order: CounterOrder, station?: 'kitchen' | 'bar') => Promise<void>) {
  await locked(async () => {
    const jobs = preparationJobs(scope), job = jobs.find(job => job.id === id)
    if (!job || job.state === 'submitted') return
    try {
      if (!printerSettings()[job.station]) throw new Error(`Select an installed ${job.station} printer first.`)
      await print(job.order, job.station); job.state = 'submitted'; delete job.error
    } catch (error) { job.state = 'failed'; job.error = error instanceof Error ? error.message : 'Printing failed.' }
    save(scope, jobs)
  })
}
