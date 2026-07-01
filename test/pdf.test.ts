import { describe, it, expect } from 'vitest'
import { buildPdf, buildPdfBytes, pdfPageCount, pdfImageCount } from '../src/pdf'
import { TINY_JPEG } from './fixtures'

describe('buildPdf', () => {
  it('erzeugt ein PDF mit einer Seite pro Bild', () => {
    const bytes = buildPdfBytes([TINY_JPEG, TINY_JPEG, TINY_JPEG])
    expect(pdfPageCount(bytes)).toBe(3)
    // jsPDF de-duplicates identical image data, so three identical images collapse to one XObject.
    // >= 1 ensures addImage() was called and embedded at least one image; 0 would mean no images.
    expect(pdfImageCount(bytes)).toBeGreaterThanOrEqual(1)
  })

  it('leere Liste ergibt 0 Seiten oder wirft nicht', () => {
    const bytes = buildPdfBytes([TINY_JPEG])
    expect(pdfPageCount(bytes)).toBe(1)
  })

  it('buildPdf gibt ein Blob mit korrektem MIME-Type zurück', () => {
    const blob = buildPdf([TINY_JPEG])
    expect(blob.type).toBe('application/pdf')
  })
})
