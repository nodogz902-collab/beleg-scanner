import { describe, it, expect } from 'vitest'
import { extractFields } from '../src/ocr/extractFields'

describe('extractFields', () => {
  it('erkennt Datum dd.mm.yyyy → YYYY-MM-DD', () => {
    expect(extractFields('Datum 01.07.2026').belegdatum).toBe('2026-07-01')
  })
  it('nimmt Betrag nach Summe/Gesamt, sonst größten', () => {
    expect(extractFields('Pos 3,00\nSumme 12,90 €\nMwSt 2,06').betrag).toBe(1290)
    expect(extractFields('9,90\n3,00\n15,00').betrag).toBe(1500)
  })
  it('lieferant = erste aussagekräftige Zeile', () => {
    expect(extractFields('REWE Markt GmbH\nRECHNUNG\n01.07.2026').lieferant).toBe('REWE Markt GmbH')
  })
  it('leerer Text → alles null', () => {
    expect(extractFields('')).toEqual({ belegdatum: null, betrag: null, lieferant: null })
  })
  it('Schlüsselwort-Betrag gewinnt über größten Betrag im Text', () => {
    // Keyword "Summe" mit 5,00 muss gegen Max 20,00 (Rabatt-Zeile) gewinnen
    expect(extractFields('Summe 5,00\nRabatt 20,00').betrag).toBe(500)
  })
  it('2-stelliges Jahr dd.mm.yy → 20yy', () => {
    expect(extractFields('Datum 01.07.26').belegdatum).toBe('2026-07-01')
  })
  it('Beleg-Fallback → lieferant null', () => {
    // Text mit nur generischen Wörtern und Zahlen triggert Fallback
    expect(extractFields('Rechnung\n99,99 €\nQuittung').lieferant).toBe(null)
  })
})
