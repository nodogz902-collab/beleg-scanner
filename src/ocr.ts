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
// Der Worker wird einmalig erzeugt, der Logger also nur einmal gesetzt — daher
// hier ein wechselbarer Callback, den recognizeFirstPage pro Lauf setzt.
let progressCb: ((p: number) => void) | null = null

/**
 * Lazy: erstellt einen deutschen Tesseract-Worker (Modell wird gecacht).
 * `onProgress` liefert 0..1 (Modell-Download beim ersten Lauf + Texterkennung).
 */
export async function recognizeFirstPage(imageDataUrl: string, onProgress?: (p: number) => void): Promise<string> {
  progressCb = onProgress ?? null
  if (!workerPromise) {
    workerPromise = createWorker('deu', undefined, {
      logger: (m: { status?: string; progress?: number }) => {
        if (progressCb && typeof m.progress === 'number') progressCb(m.progress)
      },
    })
  }
  try {
    const worker = await workerPromise
    const { data } = await worker.recognize(imageDataUrl)
    return data.text
  } catch (err) {
    workerPromise = null
    throw err
  } finally {
    progressCb = null
  }
}
