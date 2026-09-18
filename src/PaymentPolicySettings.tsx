import { extraReasons, type PaymentPolicy } from '../server/payment.mjs'
export function PaymentPolicySettings({ value, onChange }: { value: PaymentPolicy; onChange: (policy: PaymentPolicy) => void }) {
  return <section><h3>Extra-payment rules</h3><p>Saved with business settings. Extra amounts are kept separate from sales revenue. Internal payment records are retained regardless of receipt visibility.</p>
    <label className="checkbox-label"><input type="checkbox" checked={value.allowExtras} onChange={e => onChange({ ...value, allowExtras: e.target.checked })} />Allow staff to record extra money retained</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.reasonForChange} onChange={e => onChange({ ...value, reasonForChange: e.target.checked })} />Require staff to explicitly account for cash change returned</label>
    <label className="checkbox-label"><input type="checkbox" checked={value.printExtraDetails} onChange={e => onChange({ ...value, printExtraDetails: e.target.checked })} />Print extra amount, reason and explanation on customer receipts</label>
    {value.allowExtras && <><p>Allowed reasons (a reason is always required for retained extras):</p>{Object.entries(extraReasons).map(([key, label]) => <label key={key} className="checkbox-label"><input type="checkbox" checked={value.reasons.includes(key)} onChange={e => onChange({ ...value, reasons: e.target.checked ? [...value.reasons, key] : value.reasons.filter(r => r !== key) })} />{label}</label>)}</>}
  </section>
}
