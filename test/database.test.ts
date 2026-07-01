import { describe, it, expect } from 'vitest'
import { getDb } from '../src/db/database'

describe('database', () => {
  it('öffnet DB mit receipts-Store und Indexen', async () => {
    const db = await getDb()
    expect(db.objectStoreNames.contains('receipts')).toBe(true)
    const tx = db.transaction('receipts')
    const idx = Array.from(tx.store.indexNames)
    expect(idx).toContain('by-monthKey')
    expect(idx).toContain('by-lieferant')
    expect(idx).toContain('by-kategorie')
    expect(idx).toContain('by-belegdatum')
    expect(Array.from(tx.store.index('by-monthKey').keyPath)).toEqual(['jahr', 'monat'])
  })
})
