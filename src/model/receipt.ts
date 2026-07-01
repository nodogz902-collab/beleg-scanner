export function deriveYearMonth(belegdatum: string): { jahr: number; monat: number } {
  const [y, m] = belegdatum.split('-')
  return { jahr: Number(y), monat: Number(m) }
}
export function monthKey(jahr: number, monat: number): string {
  return `${jahr}-${String(monat).padStart(2, '0')}`
}
export function formatEuro(cents: number | null): string {
  if (cents === null) return '–'
  const s = (cents / 100).toFixed(2).replace('.', ',')
  return `${s} €`
}
export function parseEuroToCents(input: string): number | null {
  const m = input.replace(/[^\d.,]/g, '').trim()
  if (!m) return null
  let normalized: string
  if (m.includes(',')) {
    normalized = m.replace(/\./g, '').replace(',', '.') // 1.299,00 -> 1299.00
  } else {
    normalized = m // 12.90 oder 1290
  }
  const val = Number(normalized)
  if (!isFinite(val)) return null
  return Math.round(val * 100)
}
