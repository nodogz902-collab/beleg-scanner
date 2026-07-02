import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/detect', () => ({
  warp: vi.fn((c: HTMLCanvasElement) => {
    const w = document.createElement('canvas')
    ;(w as any).__warpedFrom = c
    return w
  }),
}))
vi.mock('../src/enhance', () => ({ photoEnhance: vi.fn(), documentGray: vi.fn() }))

import { croppedCanvas, croppedForOcr, mergeOcrIntoForm, type FormFields } from '../src/ui/EditReceipt'
import { warp } from '../src/detect'
import { photoEnhance, documentGray } from '../src/enhance'

const QUAD = { topLeft: {x:0,y:0}, topRight: {x:10,y:0}, bottomRight: {x:10,y:10}, bottomLeft: {x:0,y:10} }

beforeEach(() => vi.clearAllMocks())

describe('croppedCanvas (Anzeige/PDF: veredeltes Foto)', () => {
  it('warpt zuerst, veredelt das Foto (photoEnhance) und gibt es zurück', () => {
    const original = document.createElement('canvas')
    const out = croppedCanvas(original, QUAD)
    expect(warp).toHaveBeenCalledWith(original, QUAD)
    const warped = (warp as any).mock.results[0].value
    expect(photoEnhance).toHaveBeenCalledWith(warped)
    expect(documentGray).not.toHaveBeenCalled()
    expect(out).toBe(warped)
  })
})

describe('croppedForOcr (OCR: entschattete Graustufen)', () => {
  it('warpt zuerst, entschattet (documentGray) fuers OCR', () => {
    const original = document.createElement('canvas')
    const out = croppedForOcr(original, QUAD)
    expect(warp).toHaveBeenCalledWith(original, QUAD)
    const warped = (warp as any).mock.results.at(-1).value
    expect(documentGray).toHaveBeenCalledWith(warped)
    expect(photoEnhance).not.toHaveBeenCalled()
    expect(out).toBe(warped)
  })
})

describe('mergeOcrIntoForm', () => {
  const base: FormFields = { belegdatum: '2026-01-01', betrag: null, lieferant: '', kategorie: 'Sonstiges', tags: [], notiz: '', ocrText: '' }

  it('füllt Felder aus OCR wenn nichts angefasst wurde', () => {
    const out = mergeOcrIntoForm(base, 'ROH', { belegdatum: '2026-07-02', betrag: 1290, lieferant: 'Rewe' }, false)
    expect(out.ocrText).toBe('ROH')
    expect(out.belegdatum).toBe('2026-07-02')
    expect(out.betrag).toBe(1290)
    expect(out.lieferant).toBe('Rewe')
  })

  it('behält null-OCR-Werte als vorherige Werte (?? prev)', () => {
    const out = mergeOcrIntoForm(base, 'ROH', { belegdatum: null, betrag: null, lieferant: null }, false)
    expect(out.belegdatum).toBe('2026-01-01')
    expect(out.betrag).toBeNull()
    expect(out.lieferant).toBe('')
  })

  it('überschreibt bei touched=true nur ocrText, nicht die Felder', () => {
    const edited: FormFields = { ...base, belegdatum: '2026-05-05', betrag: 999, lieferant: 'Manuell' }
    const out = mergeOcrIntoForm(edited, 'NEU', { belegdatum: '2026-07-02', betrag: 1290, lieferant: 'Rewe' }, true)
    expect(out.ocrText).toBe('NEU')
    expect(out.belegdatum).toBe('2026-05-05')
    expect(out.betrag).toBe(999)
    expect(out.lieferant).toBe('Manuell')
  })
})
