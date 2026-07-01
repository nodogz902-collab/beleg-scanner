import { getDb } from './database'
import type { Receipt } from '../types'

// Helper to serialize Blob to Uint8Array for storage (needed for fake-indexeddb in tests)
async function serializeBlob(blob: Blob): Promise<number[]> {
  const buffer = await blob.arrayBuffer()
  return Array.from(new Uint8Array(buffer))
}

// Helper to deserialize Uint8Array back to Blob
function deserializeBlob(data: number[]): Blob {
  return new Blob([new Uint8Array(data)])
}

// Serialize receipt for storage
async function serializeReceipt(r: Receipt): Promise<any> {
  return {
    ...r,
    pdfBlob: await serializeBlob(r.pdfBlob)
  }
}

// Deserialize receipt from storage
function deserializeReceipt(r: any): Receipt {
  return {
    ...r,
    pdfBlob: Array.isArray(r.pdfBlob) ? deserializeBlob(r.pdfBlob) : r.pdfBlob
  }
}

export async function saveReceipt(r: Receipt): Promise<void> {
  const db = await getDb(); await db.put('receipts', await serializeReceipt(r))
}
export async function getReceipt(id: string): Promise<Receipt | undefined> {
  const db = await getDb(); const r = await db.get('receipts', id)
  return r ? deserializeReceipt(r) : undefined
}
export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDb(); await db.delete('receipts', id)
}
export async function allReceipts(): Promise<Receipt[]> {
  const db = await getDb(); const all = await db.getAll('receipts')
  return all.map(deserializeReceipt).sort((a, b) => (a.belegdatum < b.belegdatum ? 1 : a.belegdatum > b.belegdatum ? -1 : 0))
}
export async function listMonths(): Promise<{ jahr: number; monat: number; count: number; summe: number }[]> {
  const all = await allReceipts()
  const map = new Map<string, { jahr: number; monat: number; count: number; summe: number }>()
  for (const r of all) {
    const key = `${r.jahr}-${r.monat}`
    const cur = map.get(key) ?? { jahr: r.jahr, monat: r.monat, count: 0, summe: 0 }
    cur.count++; cur.summe += r.betrag ?? 0; map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.jahr - a.jahr || b.monat - a.monat)
}
export async function queryReceipts(q: { jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }): Promise<Receipt[]> {
  let list = await allReceipts()
  if (q.jahr !== undefined) list = list.filter(r => r.jahr === q.jahr)
  if (q.monat !== undefined) list = list.filter(r => r.monat === q.monat)
  if (q.lieferant) list = list.filter(r => r.lieferant === q.lieferant)
  if (q.kategorie) list = list.filter(r => r.kategorie === q.kategorie)
  if (q.tag) list = list.filter(r => r.tags.includes(q.tag!))
  if (q.text) {
    const t = q.text.toLowerCase()
    list = list.filter(r => `${r.lieferant} ${r.notiz} ${r.ocrText} ${r.tags.join(' ')}`.toLowerCase().includes(t))
  }
  return list
}
