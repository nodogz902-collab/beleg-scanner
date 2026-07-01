// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { serializeReceipts, deserialize, exportArchive, importArchive } from '../src/backup/zipBackup'
import { saveReceipt, allReceipts } from '../src/db/receiptStore'
import { getDb } from '../src/db/database'
import type { Receipt } from '../src/types'

const r: Receipt = { id: 'a', createdAt: 1, belegdatum: '2026-07-01', jahr: 2026, monat: 7, betrag: 1290, lieferant: 'Rewe', kategorie: 'Essen', tags: ['x'], notiz: 'n', pageBlobs: [], pdfBlob: new Blob([new Uint8Array([1,2,3])]), thumbnailDataUrl: 'data:t', ocrText: 'o' }

const mkReceipt = (id: string, betrag: number, pdfBytes: Uint8Array<ArrayBuffer>): Receipt => ({
  id,
  createdAt: Date.now(),
  belegdatum: '2026-07-01',
  jahr: 2026,
  monat: 7,
  betrag,
  lieferant: `Vendor-${id}`,
  kategorie: 'Test',
  tags: [],
  notiz: '',
  pageBlobs: [],
  pdfBlob: new Blob([pdfBytes]),
  thumbnailDataUrl: 'data:t',
  ocrText: ''
})

describe('zipBackup serialisierung', () => {
  it('serialize → deserialize erhält Metadaten und PDF-Bytes', async () => {
    const { meta, files } = await serializeReceipts([r])
    const back = await deserialize(meta, files)
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe('a'); expect(back[0].betrag).toBe(1290); expect(back[0].lieferant).toBe('Rewe')
    expect(files['pdf/a.pdf']).toEqual(new Uint8Array([1,2,3]))
  })
})

describe('zipBackup export/import round-trip', () => {
  beforeEach(async () => {
    const db = await getDb()
    await db.clear('receipts')
  })

  it('replace round-trip: export → clear → import restores receipts with data', async () => {
    // Save two receipts with distinct data
    const rec_a = mkReceipt('a', 1290, new Uint8Array([1, 2, 3]))
    const rec_b = mkReceipt('b', 5000, new Uint8Array([4, 5, 6, 7]))
    await saveReceipt(rec_a)
    await saveReceipt(rec_b)

    // Verify they're in the store
    let all = await allReceipts()
    expect(all).toHaveLength(2)

    // Export to zip
    const zip = await exportArchive()
    expect(zip.type).toBe('application/zip')

    // Import with replace mode (which clears the store)
    const n = await importArchive(zip, 'replace')
    expect(n).toBe(2)

    // Verify receipts are restored
    all = await allReceipts()
    expect(all).toHaveLength(2)

    // Verify receipt 'a' data survived
    const restored_a = all.find(r => r.id === 'a')
    expect(restored_a).toBeDefined()
    expect(restored_a!.betrag).toBe(1290)
    expect(restored_a!.lieferant).toBe('Vendor-a')
    const pdfBytes_a = new Uint8Array(await restored_a!.pdfBlob.arrayBuffer())
    expect(pdfBytes_a).toEqual(new Uint8Array([1, 2, 3]))

    // Verify receipt 'b' data survived
    const restored_b = all.find(r => r.id === 'b')
    expect(restored_b).toBeDefined()
    expect(restored_b!.betrag).toBe(5000)
    expect(restored_b!.lieferant).toBe('Vendor-b')
    const pdfBytes_b = new Uint8Array(await restored_b!.pdfBlob.arrayBuffer())
    expect(pdfBytes_b).toEqual(new Uint8Array([4, 5, 6, 7]))
  })

  it('merge re-IDs: import with merge preserves original and adds re-ID copy', async () => {
    // Save one receipt
    const rec_a = mkReceipt('a', 1290, new Uint8Array([1, 2, 3]))
    await saveReceipt(rec_a)

    // Export to zip
    const zip = await exportArchive()

    // Import with merge mode (should re-ID the imported one)
    const n = await importArchive(zip, 'merge')
    expect(n).toBe(1)

    // Verify store has 2 receipts: original 'a' + re-ID'd copy
    const all = await allReceipts()
    expect(all).toHaveLength(2)

    // Verify original 'a' still exists
    const original = all.find(r => r.id === 'a')
    expect(original).toBeDefined()
    expect(original!.betrag).toBe(1290)

    // Verify re-ID'd copy exists with pattern 'a-imp-<createdAt>'
    const reimported = all.find(r => r.id.startsWith('a-imp-'))
    expect(reimported).toBeDefined()
    expect(reimported!.betrag).toBe(1290)
    const pdfBytes = new Uint8Array(await reimported!.pdfBlob.arrayBuffer())
    expect(pdfBytes).toEqual(new Uint8Array([1, 2, 3]))
  })
})