export type Product = {
  id: string
  name: string
  sku: string
  barcode?: string
  category: string
  stock: number
  reorder: number
  price: number
  cost?: number
  unit: string
  updated: string
}

export type Sale = {
  organizationId?: string
  businessName?: string
  currency?: string
  id: string
  items: Array<{ productId: string; productName?: string; quantity: number; price: number }>
  total: number
  createdAt: string
  syncStatus: 'pending' | 'synced'
  paymentMethod: 'external-pos' | 'bank-transfer' | 'multiple' | 'cash' | 'wallet'
  paymentReference?: string
  terminalProvider?: string
  cashReceived?: number | null
  changeGiven?: number | null
  paymentDetails?: import('../server/payment.mjs').PaymentDetails
  staffId?: string
  staffName?: string
}

export type Customer = { id: string; name: string; phone: string; balance: number; transactions?: Array<{ id: string; amount: number; reason: string; createdAt: string }> }

export type Stocktake = {
  id: string
  status: 'draft' | 'approved'
  createdAt: string
  approvalReason?: string
  counts: Array<{ id: string; productId: string; name: string; sku: string; expected: number; counted: number; variance: number }>
  history?: Array<{ id: string; productId: string; name: string; sku: string; expected: number; counted: number; variance: number; reason: string; createdAt: string }>
}
