export function overdueJob(job, today) {
  return !['estimate', 'cancelled', 'completed'].includes(job.status) && Boolean(job.dueDate && job.dueDate.slice(0,10) < today)
}
export function filterServiceJobs(jobs, { query = '', status = 'all', today }) {
  const search = query.trim().toLowerCase()
  return jobs.filter(job => (status === 'all' || status === 'overdue' ? status !== 'overdue' || overdueJob(job,today) : status === 'unpaid' ? !['estimate','cancelled'].includes(job.status) && job.balance.due > 0 : job.status === status) && [job.id,job.title,job.customerName,job.customerPhone,...job.lines.map(line=>line.description)].join(' ').toLowerCase().includes(search))
}
export function invoiceStatements(jobs) {
  const groups = new Map(), cents = value => Math.round(Number(value) * 100)
  for (const job of jobs.filter(job=>!['estimate','cancelled'].includes(job.status))) {
    // Unidentified legacy customers remain separate rather than merging namesakes.
    const customer = job.customerId || (job.customerPhone?.trim() ? JSON.stringify([job.customerName.trim().toLowerCase(),job.customerPhone.trim()]) : job.id)
    const key=JSON.stringify([customer,job.currency])
    const group=groups.get(key)||{key,customerName:job.customerName,customerPhone:job.customerPhone,currency:job.currency,businessName:job.businessName,jobs:[],total:0,netPaid:0,due:0}
    group.jobs.push(job);group.total+=cents(job.pricing.total);group.netPaid+=cents(job.balance.netPaid);group.due+=cents(job.balance.due);groups.set(key,group)
  }
  return [...groups.values()].map(group=>({...group,total:group.total/100,netPaid:group.netPaid/100,due:group.due/100}))
}
