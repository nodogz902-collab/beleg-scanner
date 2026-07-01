import { describe, it, expect } from 'vitest'
import { deriveYearMonth, formatEuro, parseEuroToCents, monthKey } from '../src/model/receipt'

describe('receipt model', () => {
  it('deriveYearMonth aus YYYY-MM-DD', () => {
    expect(deriveYearMonth('2026-07-01')).toEqual({ jahr: 2026, monat: 7 })
  })
  it('formatEuro', () => {
    expect(formatEuro(1290)).toBe('12,90 €')
    expect(formatEuro(null)).toBe('–')
    expect(formatEuro(0)).toBe('0,00 €')
  })
  it('parseEuroToCents versteht deutsche und Punkt-Formate', () => {
    expect(parseEuroToCents('12,90 €')).toBe(1290)
    expect(parseEuroToCents('1.299,00')).toBe(129900)
    expect(parseEuroToCents('12.90')).toBe(1290)
    expect(parseEuroToCents('abc')).toBe(null)
  })
  it('monthKey', () => { expect(monthKey(2026, 7)).toBe('2026-07') })
})
