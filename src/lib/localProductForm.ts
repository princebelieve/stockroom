import { readPhotoData } from './receiptOcr'
import { extractProductForm } from '../../cloud/product-form-layout.mjs'

export async function readLocalProductForm(file: File, signal: AbortSignal, progress: (message: string) => void) {
  const data = await readPhotoData(file, signal, progress, true, true)
  const words = (data.blocks || []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words.map(word => ({
    confidence: word.confidence / 100,
    symbols: [...word.text.trim()].map(text => ({ text })),
    boundingBox: { vertices: [{ x: word.bbox.x0, y: word.bbox.y0 }, { x: word.bbox.x1, y: word.bbox.y0 }, { x: word.bbox.x1, y: word.bbox.y1 }, { x: word.bbox.x0, y: word.bbox.y1 }] },
  })))))
  return extractProductForm({ pages: [{ blocks: [{ paragraphs: [{ words }] }] }] }, 'On-device text reader')
}
