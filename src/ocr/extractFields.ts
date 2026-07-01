import { parseEuroToCents } from '../model/receipt'
import { suggestTitle } from '../ocr'

function extractDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function extractAmount(text: string): number | null {
  const lines = text.split('\n')
  const kw = /(summe|gesamt|total|betrag|zu zahlen)/i
  const amountRe = /(\d{1,3}(?:[.\s]\d{3})*|\d+)[,.]\d{2}/g
  // 1) Zeile mit Schlüsselwort bevorzugen
  for (const line of lines) {
    if (kw.test(line)) {
      const found = line.match(amountRe)
      if (found?.length) return parseEuroToCents(found[found.length - 1])
    }
  }
  // 2) sonst größter Betrag im Text
  const all = (text.match(amountRe) ?? []).map(parseEuroToCents).filter((n): n is number => n !== null)
  return all.length ? Math.max(...all) : null
}

export function extractFields(text: string): { belegdatum: string | null; betrag: number | null; lieferant: string | null } {
  if (!text.trim()) return { belegdatum: null, betrag: null, lieferant: null }
  const title = suggestTitle(text, new Date())
  const lieferant = title.startsWith('Beleg-') ? null : title
  return { belegdatum: extractDate(text), betrag: extractAmount(text), lieferant }
}
