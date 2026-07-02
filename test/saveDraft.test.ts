import { describe, it, expect } from 'vitest'
import { buildReceiptFromForm } from '../src/ui/EditReceipt'

describe('buildReceiptFromForm', () => {
  it('leitet jahr/monat ab und übernimmt Formularwerte', () => {
    const c = document.createElement('canvas'); c.width = 10; c.height = 10
    const r = buildReceiptFromForm({ pages: [c], id: 'id1', now: 5, form: { belegdatum: '2026-07-01', einscannungsdatum: '2026-07-02', betrag: 1290, kategorie: 'Essen', tags: ['x'], notiz: 'n', ocrText: 'o' } })
    expect(r.jahr).toBe(2026); expect(r.monat).toBe(7); expect(r.betrag).toBe(1290); expect(r.einscannungsdatum).toBe('2026-07-02')
    expect(r.id).toBe('id1'); expect(r.createdAt).toBe(5)
    expect(r.pdfBlob.type).toBe('application/pdf')
    expect(r.thumbnailDataUrl.startsWith('data:image')).toBe(true)
  })
})
