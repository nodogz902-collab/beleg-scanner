import { describe, it, expect } from 'vitest'
import { serializeReceipts, deserialize } from '../src/backup/zipBackup'
import type { Receipt } from '../src/types'

const r: Receipt = { id: 'a', createdAt: 1, belegdatum: '2026-07-01', jahr: 2026, monat: 7, betrag: 1290, lieferant: 'Rewe', kategorie: 'Essen', tags: ['x'], notiz: 'n', pageBlobs: [], pdfBlob: new Blob([new Uint8Array([1,2,3])]), thumbnailDataUrl: 'data:t', ocrText: 'o' }

describe('zipBackup serialisierung', () => {
  it('serialize → deserialize erhält Metadaten und PDF-Bytes', async () => {
    const { meta, files } = await serializeReceipts([r])
    const back = await deserialize(meta, files)
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe('a'); expect(back[0].betrag).toBe(1290); expect(back[0].lieferant).toBe('Rewe')
    expect(files['pdf/a.pdf']).toEqual(new Uint8Array([1,2,3]))
  })
})
