import { recordPayment, paymentPolicy } from './server/payment.mjs'

const policy = paymentPolicy({ allowExtras: true, reasonForChange: true, reasons: ['tip'] })
const cash200 = recordPayment({ paymentMethod: 'cash', total: 200, paymentDetails: { amountReceived: '1000', extraKept: '0' } }, policy)
const cash10 = recordPayment({ paymentMethod: 'cash', total: 10, paymentDetails: { amountReceived: '15', extraKept: '2', reason: 'tip' } }, policy)
console.log(JSON.stringify({
  change200: cash200.paymentDetails.changeGiven,
  extra200: cash200.paymentDetails.extraKept,
  change10: cash10.paymentDetails.changeGiven,
  extra10: cash10.paymentDetails.extraKept
}, null, 2))
