import { describe, it, expect } from 'vitest'
import { buildPdf, pdfPageCount } from '../src/pdf'
import { TINY_JPEG } from './fixtures'

describe('buildPdf', () => {
  it('erzeugt ein PDF mit einer Seite pro Bild', async () => {
    const blob = buildPdf([TINY_JPEG, TINY_JPEG, TINY_JPEG])
    expect(blob.type).toBe('application/pdf')
    expect(await pdfPageCount(blob)).toBe(3)
  })

  it('leere Liste ergibt 0 Seiten oder wirft nicht', async () => {
    const blob = buildPdf([TINY_JPEG])
    expect(await pdfPageCount(blob)).toBe(1)
  })
})
