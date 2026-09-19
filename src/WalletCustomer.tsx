import { useState } from 'react'
import type { Customer } from './types'
import { AsyncForm, SubmitButton } from './AsyncControls'

export function WalletCustomer({ customer, money, adjust }: { customer: Customer; money: (amount: number) => string; adjust: (id: string, amount: number, reason: string) => Promise<void> }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [direction, setDirection] = useState('credit')
  return <section className="panel">
    <h3>{customer.name}</h3><p>{customer.phone}</p>
    <p>{customer.balance < 0 ? `Amount owed: ${money(-customer.balance)}` : `Prepaid balance: ${money(customer.balance)}`}</p>
    <AsyncForm className="payment-options" busyLabel="Recording..." onSubmit={async event => {
      event.preventDefault()
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !reason.trim()) throw new Error('Enter a positive amount with at most two decimals and a reason.')
      await adjust(customer.id, Number(amount) * (direction === 'credit' ? 1 : -1), reason.trim())
      setAmount(''); setReason('')
    }}>
      <label>Transaction<select value={direction} onChange={e => setDirection(e.target.value)}><option value="credit">Deposit / debt repayment</option><option value="debit">Withdraw prepaid funds</option></select></label>
      <label>Amount<input type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Reason / payment reference<input required maxLength={200} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <SubmitButton className="primary-button">Record transaction</SubmitButton>
    </AsyncForm>
    <details><summary>Recent wallet transactions</summary>
      {customer.transactions?.length ? <div className="table-wrap"><table><thead><tr><th>Date</th><th>Credit</th><th>Debit</th><th>Reason</th></tr></thead><tbody>{customer.transactions.map(transaction => <tr key={transaction.id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td>{transaction.amount > 0 ? money(transaction.amount) : '—'}</td><td>{transaction.amount < 0 ? money(-transaction.amount) : '—'}</td><td>{transaction.reason}</td></tr>)}</tbody></table></div> : <p>No transactions recorded.</p>}
    </details>
  </section>
}
