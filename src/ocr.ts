import { createWorker } from 'tesseract.js'

const GENERIC = new Set(['rechnung', 'quittung', 'beleg', 'kassenbon', 'bon', 'invoice', 'receipt'])

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function dateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function suggestTitle(text: string, date: Date): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const cleaned = sanitize(line)
    if (cleaned.length < 4) continue
    if (GENERIC.has(cleaned.toLowerCase())) continue
    if (/^[\d.,\s€$-]+$/.test(cleaned)) continue // nur Zahlen/Beträge
    return cleaned
  }
  return `Beleg-${dateStamp(date)}`
}

let workerPromise: ReturnType<typeof createWorker> | null = null

/** Lazy: erstellt einen deutschen Tesseract-Worker (Modell wird gecacht). */
export async function recognizeFirstPage(imageDataUrl: string): Promise<string> {
  if (!workerPromise) workerPromise = createWorker('deu')
  const worker = await workerPromise
  const { data } = await worker.recognize(imageDataUrl)
  return data.text
}
