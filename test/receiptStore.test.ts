import { describe, it, expect, beforeEach } from 'vitest'
import { saveReceipt, getReceipt, deleteReceipt, allReceipts, listMonths, queryReceipts } from '../src/db/receiptStore'
import { getDb } from '../src/db/database'
import type { Receipt } from '../src/types'

function mk(id: string, belegdatum: string, betrag: number | null, over: Partial<Receipt> = {}): Receipt {
  const [y, m] = belegdatum.split('-').map(Number)
  return { id, createdAt: 1, belegdatum, jahr: y, monat: m, betrag, lieferant: over.lieferant ?? 'ACME', kategorie: over.kategorie ?? 'Sonstiges', tags: over.tags ?? [], notiz: over.notiz ?? '', pageBlobs: [], pdfBlob: new Blob(['%PDF']), thumbnailDataUrl: 'data:x', ocrText: over.ocrText ?? '' }
}

beforeEach(async () => { const db = await getDb(); await db.clear('receipts') })

describe('receiptStore', () => {
  it('save/get/delete', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1290))
    expect((await getReceipt('a'))?.betrag).toBe(1290)
    await deleteReceipt('a')
    expect(await getReceipt('a')).toBeUndefined()
  })
  it('allReceipts absteigend nach belegdatum', async () => {
    await saveReceipt(mk('a', '2026-06-01', 100)); await saveReceipt(mk('b', '2026-07-01', 200))
    expect((await allReceipts()).map(r => r.id)).toEqual(['b', 'a'])
  })
  it('listMonths zählt und summiert', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1000)); await saveReceipt(mk('b', '2026-07-15', 500)); await saveReceipt(mk('c', '2026-06-01', 300))
    const months = await listMonths()
    expect(months[0]).toEqual({ jahr: 2026, monat: 7, count: 2, summe: 1500 })
    expect(months[1]).toEqual({ jahr: 2026, monat: 6, count: 1, summe: 300 })
  })
  it('queryReceipts filtert nach Monat, Lieferant, Tag, Text', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1000, { lieferant: 'Rewe', tags: ['essen'], ocrText: 'Milch Brot' }))
    await saveReceipt(mk('b', '2026-07-02', 2000, { lieferant: 'OBI', tags: ['bau'], ocrText: 'Schrauben' }))
    expect((await queryReceipts({ jahr: 2026, monat: 7 })).length).toBe(2)
    expect((await queryReceipts({ lieferant: 'Rewe' })).map(r => r.id)).toEqual(['a'])
    expect((await queryReceipts({ tag: 'bau' })).map(r => r.id)).toEqual(['b'])
    expect((await queryReceipts({ text: 'schrauben' })).map(r => r.id)).toEqual(['b'])
  })
})
