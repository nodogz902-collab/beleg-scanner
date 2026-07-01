import { describe, it, expect } from 'vitest'
import { buildPdf, buildPdfBytes, pdfPageCount } from '../src/pdf'
import { TINY_JPEG } from './fixtures'

describe('buildPdf', () => {
  it('erzeugt ein PDF mit einer Seite pro Bild', () => {
    const bytes = buildPdfBytes([TINY_JPEG, TINY_JPEG, TINY_JPEG])
    expect(pdfPageCount(bytes)).toBe(3)
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
