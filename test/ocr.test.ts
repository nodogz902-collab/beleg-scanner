import { describe, it, expect } from 'vitest'
import { suggestTitle } from '../src/ocr'

const D = new Date('2026-07-01T10:00:00Z')

describe('suggestTitle', () => {
  it('nimmt die erste aussagekräftige Zeile als Namen', () => {
    const text = 'RECHNUNG\nACME Handels GmbH\nDatum 01.07.2026'
    expect(suggestTitle(text, D)).toBe('ACME Handels GmbH')
  })

  it('überspringt Generik-Wörter wie RECHNUNG/QUITTUNG', () => {
    const text = 'QUITTUNG\nBäckerei Müller'
    expect(suggestTitle(text, D)).toBe('Bäckerei Müller')
  })

  it('fällt auf Datum-Default zurück, wenn nichts brauchbar ist', () => {
    expect(suggestTitle('\n\n12,90\n', D)).toBe('Beleg-2026-07-01')
  })

  it('entfernt dateiungültige Zeichen', () => {
    expect(suggestTitle('Firma / Nr: 4711', D)).toBe('Firma Nr 4711')
  })
})
