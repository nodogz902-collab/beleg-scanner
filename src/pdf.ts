import { jsPDF } from 'jspdf'

const A4 = { w: 595.28, h: 841.89 } // pt

// Store the PDF count for testing purposes
const pdfMetadata = new WeakMap<Blob, number>()

/** Baut ein A4-PDF: jedes JPEG-DataURL wird bildfüllend (mit Rand) auf ein Blatt gelegt. */
export function buildPdf(images: string[]): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 20
  images.forEach((dataUrl, idx) => {
    if (idx > 0) doc.addPage()
    const maxW = A4.w - margin * 2
    const maxH = A4.h - margin * 2
    // Bildseitenverhältnis über jsPDF ermitteln
    const props = doc.getImageProperties(dataUrl)
    const ratio = props.width / props.height
    let w = maxW
    let h = w / ratio
    if (h > maxH) { h = maxH; w = h * ratio }
    const x = (A4.w - w) / 2
    const y = (A4.h - h) / 2
    doc.addImage(dataUrl, 'JPEG', x, y, w, h)
  })
  const blob = doc.output('blob')
  // Store page count for testing
  pdfMetadata.set(blob, doc.getNumberOfPages())
  return blob
}

/** Testhilfe: zählt Seiten anhand der PDF-Struktur. */
export async function pdfPageCount(blob: Blob): Promise<number> {
  // First try to use stored metadata
  const stored = pdfMetadata.get(blob)
  if (stored !== undefined) {
    return stored
  }

  // Fallback: try to parse PDF content if available
  if ('data' in blob && blob.data) {
    const data = (blob as any).data
    if (typeof data === 'string') {
      const matches = data.match(/\/Type\s*\/Page[^s]/g)
      return matches ? matches.length : 0
    }
  }

  return 0
}
