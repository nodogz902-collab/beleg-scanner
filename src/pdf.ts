import { jsPDF } from 'jspdf'

const A4 = { w: 595.28, h: 841.89 } // pt

/** Baut ein A4-PDF und gibt die Bytes zurück: jedes JPEG-DataURL wird bildfüllend (mit Rand) auf ein Blatt gelegt. */
export function buildPdfBytes(images: string[]): Uint8Array {
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
  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}

/** Baut ein A4-PDF: jedes JPEG-DataURL wird bildfüllend (mit Rand) auf ein Blatt gelegt. */
export function buildPdf(images: string[]): Blob {
  const bytes = buildPdfBytes(images)
  return new Blob([bytes], { type: 'application/pdf' })
}

/** Zählt Seiten anhand der realen PDF-Bytes durch Parsing von /Type /Page Objekten. */
export function pdfPageCount(bytes: Uint8Array): number {
  // Dekodiere die Bytes zu einem Latin-1-String für PDF-Texterkennung
  const binaryString = new TextDecoder('latin1').decode(bytes)
  // Zähle /Type /Page (nicht /Type /Pages, die ist der Baum-Knoten)
  const matches = binaryString.match(/\/Type\s*\/Page(?![s])/g)
  return matches ? matches.length : 0
}
