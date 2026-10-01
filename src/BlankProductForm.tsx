import { createPortal } from 'react-dom'
import { Printer } from 'lucide-react'
import { AsyncButton } from './AsyncControls'
import { printDocument, printerSettings } from './lib/printing'
import { businessModes, type BusinessMode } from './BusinessProfileSettings'

export function BlankProductForm({ businessName, businessMode, currency }: { businessName: string; businessMode: BusinessMode; currency: string }) {
  const profile = businessModes[businessMode]
  const fields = [
    ['Product name', ''], ['Barcode', 'If available'], ['SKU', 'Leave blank if the app should generate it'],
    ['Category', ''], ['Unit', `Usual unit for this business: ${profile.unit}. Write the unit for this product.`],
    ['Starting stock', 'Count using the unit written above'], ['Reorder point', 'Stock level at which to reorder'],
    ['Cost price per unit', `What you paid for one unit (${currency})`], ['Selling price per unit', `What you charge for one unit (${currency})`],
  ]
  return <>
    <AsyncButton type="button" className="filter-button" busyLabel="Preparing form..." onClick={() => printDocument('report', printerSettings(), false, true)}><Printer size={18} />Print blank product form</AsyncButton>
    {createPortal(<section className="blank-product-form" aria-hidden="true">
      <div style={{ color: '#000', background: '#fff', font: '12pt Arial, sans-serif', padding: '8mm', boxSizing: 'border-box', maxWidth: '190mm', margin: '0 auto' }}>
        <h1 style={{ fontSize: '20pt', margin: '0 0 3mm', overflowWrap: 'anywhere' }}>{businessName}</h1>
        <h2 style={{ fontSize: '16pt', margin: '0 0 3mm' }}>Product registration form</h2>
        <p style={{ margin: '0 0 3mm' }}>{profile.label} · Currency: {currency}</p>
        <p style={{ margin: '0 0 5mm', fontSize: '10pt' }}>Stockroom product form v1. Photocopy one per product. For best results, write clearly in <strong>BLOCK / CAPITAL LETTERS</strong> below each heading. Photograph the entire page upright.</p>
        {fields.map(([label, hint], index) => <div key={label} style={{ border: '1px solid #000', padding: '2mm 3mm', height: '20mm', boxSizing: 'border-box', breakInside: 'avoid', marginTop: '-1px' }}>
          <div style={{ height: '6mm', overflow: 'hidden' }}><strong style={{ fontSize: '11pt' }}><span style={{ fontFamily: 'monospace' }}>F{String(index + 1).padStart(2, '0')}</span> {label}</strong>{hint && <span style={{ fontSize: '8pt', marginLeft: '2mm' }}>{hint}</span>}</div>
        </div>)}
        <p style={{ margin: '2mm 3mm 0', fontSize: '10pt' }}><span style={{ fontFamily: 'monospace' }}>F10</span> End of form. Use the same unit for stock, cost and selling price.</p>
      </div>
    </section>, document.body)}
  </>
}
