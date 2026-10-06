import { useMemo } from 'react'
import { qrMatrix } from './lib/qrCode'

export function QrCode({ value, label = 'Customer portal QR code' }: { value: string; label?: string }) {
  const modules = useMemo(() => qrMatrix(value), [value])
  const size = modules.length
  const path = modules.flatMap((row, y) => row.flatMap((dark, x) => dark ? [`M${x + 4} ${y + 4}h1v1h-1z`] : [])).join('')
  return <svg className="customer-qr" role="img" aria-label={label} viewBox={`0 0 ${size + 8} ${size + 8}`} shapeRendering="crispEdges"><rect width={size + 8} height={size + 8} fill="white" /><path d={path} fill="#111" /></svg>
}
