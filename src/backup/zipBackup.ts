import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { Receipt } from '../types'
import { allReceipts, saveReceipt } from '../db/receiptStore'

type MetaReceipt = Omit<Receipt, 'pageBlobs' | 'pdfBlob' | 'thumbnailDataUrl'> & { thumbnailDataUrl: string }

async function blobToU8(b: Blob): Promise<Uint8Array> {
  const buf = await b.arrayBuffer(); return new Uint8Array(buf)
}

export async function serializeReceipts(receipts: Receipt[]): Promise<{ meta: { version: number; receipts: MetaReceipt[] }; files: Record<string, Uint8Array> }> {
  const files: Record<string, Uint8Array> = {}
  const metaReceipts: MetaReceipt[] = []
  for (const r of receipts) {
    files[`pdf/${r.id}.pdf`] = await blobToU8(r.pdfBlob)
    const { pageBlobs, pdfBlob, ...rest } = r
    metaReceipts.push(rest)
  }
  return { meta: { version: 1, receipts: metaReceipts }, files }
}

export async function deserialize(meta: { receipts: MetaReceipt[] }, files: Record<string, Uint8Array>): Promise<Receipt[]> {
  return meta.receipts.map(m => ({
    ...m,
    pageBlobs: [],
    pdfBlob: new Blob([(files[`pdf/${m.id}.pdf`] ?? new Uint8Array(0)) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }),
  }))
}

export async function exportArchive(): Promise<Blob> {
  const receipts = await allReceipts()
  const { meta, files } = await serializeReceipts(receipts)
  const entries: Record<string, Uint8Array> = { 'metadata.json': strToU8(JSON.stringify(meta)), ...files }
  const zipped = zipSync(entries)
  return new Blob([zipped], { type: 'application/zip' })
}

export async function importArchive(zip: Blob, mode: 'merge' | 'replace'): Promise<number> {
  const bytes = new Uint8Array(await zip.arrayBuffer())
  const files = unzipSync(bytes)
  const meta = JSON.parse(strFromU8(files['metadata.json']))
  const fileRecord: Record<string, Uint8Array> = {}
  for (const name of Object.keys(files)) if (name.startsWith('pdf/')) fileRecord[name] = files[name]
  const receipts = await deserialize(meta, fileRecord)
  if (mode === 'replace') { const db = (await import('../db/database')).getDb; await (await db()).clear('receipts') }
  for (const r of receipts) {
    if (mode === 'merge') r.id = `${r.id}-imp-${r.createdAt}`
    await saveReceipt(r)
  }
  return receipts.length
}
