import { describe, it, expect } from 'vitest'
import { buildReceiptFromForm } from '../src/ui/EditReceipt'

describe('buildReceiptFromForm', () => {
  it('leitet jahr/monat ab und übernimmt Formularwerte', () => {
    const c = document.createElement('canvas'); c.width = 10; c.height = 10
    const r = buildReceiptFromForm({ pages: [c], id: 'id1', now: 5, form: { belegdatum: '2026-07-01', betrag: 1290, lieferant: 'Rewe', kategorie: 'Essen', tags: ['x'], notiz: 'n', ocrText: 'o' } })
    expect(r.jahr).toBe(2026); expect(r.monat).toBe(7); expect(r.betrag).toBe(1290); expect(r.lieferant).toBe('Rewe')
    expect(r.id).toBe('id1'); expect(r.createdAt).toBe(5)
    expect(r.pdfBlob.type).toBe('application/pdf')
    expect(r.thumbnailDataUrl.startsWith('data:image')).toBe(true)
  })
})
