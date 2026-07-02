# Zuschnitt vor OCR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OCR im Edit-Screen liest das entzerrte, zugeschnittene Dokument statt des vollen Kamerabildes; bei manueller Zuschnitt-Anpassung läuft OCR erneut, ohne manuelle Feld-Korrekturen zu überschreiben.

**Architecture:** Der bestehende `warp` + `enhanceCanvas`-Zuschnitt (bisher nur beim Speichern) wird vor die OCR gezogen. Reine, testbare Helfer (`croppedDataUrl`, `mergeOcrIntoForm`) kapseln die Logik; der Crop-Editor bekommt ein `onCommit`-Event für Re-OCR am Drag-Ende. Die Preact-Komponente `EditReceipt` verdrahtet nur noch diese Bausteine.

**Tech Stack:** TypeScript, Preact, Vite, Vitest (jsdom), jscanify/OpenCV (`warp`), Tesseract.js (`recognizeFirstPage`).

## Global Constraints

- Keine neuen Runtime-Dependencies (nur vorhandene Module).
- Locator/Best-Practice-Regeln betreffen dieses Repo nicht (kein Playwright hier).
- Tests laufen unter `jsdom`, Vitest-Globals sind aktiv (`vite.config.ts:36`) — kein Import von `describe/it/expect` nötig, aber bestehende Testdateien importieren sie explizit; diesem Stil folgen.
- OCR bleibt „best effort": jeder OCR-Aufruf ist in `try/catch`, Fehler dürfen das Formular nicht verändern.
- Commit-Konvention: Conventional Commits (`feat:`, `test:`, `refactor:`), keine AI-Attribution.

## File Structure

- `src/cropEditor.ts` — **Modify.** Neuer optionaler `onCommit`-Callback; feuert am Pointer-Up nur nach echtem Drag.
- `src/ui/EditReceipt.tsx` — **Modify.** Zwei neue exportierte Pure-Helfer (`croppedDataUrl`, `mergeOcrIntoForm`); useEffect-OCR läuft auf dem Zuschnitt; `touchedRef` + `onCommit`-Handler für Re-OCR.
- `test/cropEditor.test.ts` — **Modify.** Tests für `onCommit`.
- `test/editReceiptOcr.test.ts` — **Create.** Tests für `croppedDataUrl` (Reihenfolge crop→dataUrl) und `mergeOcrIntoForm` (touched-Guard).

---

### Task 1: Crop-Editor `onCommit`-Event

**Files:**
- Modify: `src/cropEditor.ts:19-78`
- Test: `test/cropEditor.test.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `mountCropEditor(container, canvas, initial, onChange?, onCommit?)` — `onCommit?: (q: Quad) => void`, gefeuert genau einmal pro Pointer-Geste, aber nur wenn zwischen `pointerdown` und `pointerup` mindestens ein `pointermove` eine Ecke bewegt hat. Liefert einen tiefen Quad-Snapshot (wie `getQuad()`).

- [ ] **Step 1: Failing-Test schreiben**

In `test/cropEditor.test.ts` ergänzen (Imports oben um `mountCropEditor` erweitern):

```ts
import { describe, it, expect, vi } from 'vitest'
import { clientToImage, mountCropEditor } from '../src/cropEditor'

function setup() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const canvas = document.createElement('canvas')
  canvas.width = 1000; canvas.height = 2000
  const initial = {
    topLeft: { x: 0, y: 0 }, topRight: { x: 1000, y: 0 },
    bottomRight: { x: 1000, y: 2000 }, bottomLeft: { x: 0, y: 2000 },
  }
  return { container, canvas, initial }
}

describe('mountCropEditor onCommit', () => {
  it('feuert einmal nach einem Drag (down → move → up)', () => {
    const { container, canvas, initial } = setup()
    const onCommit = vi.fn()
    const editor = mountCropEditor(container, canvas, initial, undefined, onCommit)
    const handle = container.querySelector('.corner-handle') as HTMLElement
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 20, clientY: 30 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(onCommit).toHaveBeenCalledTimes(1)
    editor.destroy()
  })

  it('feuert NICHT bei Klick ohne Bewegung (down → up)', () => {
    const { container, canvas, initial } = setup()
    const onCommit = vi.fn()
    const editor = mountCropEditor(container, canvas, initial, undefined, onCommit)
    const handle = container.querySelector('.corner-handle') as HTMLElement
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    expect(onCommit).not.toHaveBeenCalled()
    editor.destroy()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/cropEditor.test.ts`
Expected: FAIL — die beiden neuen `onCommit`-Tests schlagen fehl (`onCommit` wird nie aufgerufen, da der Parameter noch nicht existiert). `clientToImage`-Tests bleiben grün.

- [ ] **Step 3: `onCommit` implementieren**

In `src/cropEditor.ts` die Signatur und die Pointer-Handler anpassen:

```ts
export function mountCropEditor(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  initial: Quad,
  onChange?: (q: Quad) => void,
  onCommit?: (q: Quad) => void,
): { getQuad(): Quad; destroy(): void } {
```

Innerhalb der Funktion die Drag-Verfolgung ergänzen und `onUp` erweitern:

```ts
  let active: typeof CORNER_KEYS[number] | null = null
  let dragged = false
  function onDown(e: PointerEvent) {
    const key = (e.target as HTMLElement).dataset?.key as typeof active
    if (key) { active = key; dragged = false; e.preventDefault() }
  }
  function onMove(e: PointerEvent) {
    if (!active) return
    dragged = true
    const rect = canvas.getBoundingClientRect()
    quad[active] = clientToImage(e.clientX, e.clientY, rect, canvas.width, canvas.height)
    place()
    onChange?.(quad)
  }
  function onUp() {
    if (active && dragged) onCommit?.(JSON.parse(JSON.stringify(quad)))
    active = null
    dragged = false
  }
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/cropEditor.test.ts`
Expected: PASS — alle vier Tests (2× `clientToImage`, 2× `onCommit`) grün.

- [ ] **Step 5: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/cropEditor.ts test/cropEditor.test.ts
git commit -m "feat: add onCommit event to crop editor for drag-end callbacks"
```

---

### Task 2: Pure-Helfer `croppedDataUrl` und `mergeOcrIntoForm`

**Files:**
- Modify: `src/ui/EditReceipt.tsx` (neue Exports; Imports `warp`, `enhanceCanvas` sind schon vorhanden — Zeilen 3-4)
- Create: `test/editReceiptOcr.test.ts`

**Interfaces:**
- Consumes: `warp(canvas, quad): HTMLCanvasElement` (`src/detect.ts:132`), `enhanceCanvas(canvas): void` (`src/enhance.ts:23`), Typ `Quad` (`src/types.ts:6`), `FormFields` (`src/ui/EditReceipt.tsx:15`), Rückgabe von `extractFields`: `{ belegdatum: string | null; betrag: number | null; lieferant: string | null }` (`src/ocr/extractFields.ts:28`).
- Produces:
  - `croppedDataUrl(original: HTMLCanvasElement, quad: Quad): string` — warpt + enhanct + gibt JPEG-DataURL (Qualität 0.85). Reihenfolge garantiert: `warp` zuerst, dann `enhanceCanvas` auf dem Warp-Ergebnis, dann `toDataURL` desselben Canvas.
  - `mergeOcrIntoForm(prev: FormFields, ocrText: string, extracted: { belegdatum: string | null; betrag: number | null; lieferant: string | null }, touched: boolean): FormFields` — setzt `ocrText` immer; füllt `belegdatum/betrag/lieferant` nur wenn `touched === false` (mit `?? prev`-Fallback).

- [ ] **Step 1: Failing-Test schreiben**

`test/editReceiptOcr.test.ts` neu anlegen:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/detect', () => ({
  warp: vi.fn((c: HTMLCanvasElement) => {
    const w = document.createElement('canvas')
    ;(w as any).__warpedFrom = c
    w.toDataURL = () => 'data:image/jpeg;base64,WARPED'
    return w
  }),
}))
vi.mock('../src/enhance', () => ({ enhanceCanvas: vi.fn() }))

import { croppedDataUrl, mergeOcrIntoForm, type FormFields } from '../src/ui/EditReceipt'
import { warp } from '../src/detect'
import { enhanceCanvas } from '../src/enhance'

const QUAD = { topLeft: {x:0,y:0}, topRight: {x:10,y:0}, bottomRight: {x:10,y:10}, bottomLeft: {x:0,y:10} }

describe('croppedDataUrl', () => {
  it('warpt zuerst, enhanct das Warp-Ergebnis und liefert dessen DataURL', () => {
    const original = document.createElement('canvas')
    const url = croppedDataUrl(original, QUAD)
    expect(warp).toHaveBeenCalledWith(original, QUAD)
    const warped = (warp as any).mock.results[0].value
    expect(enhanceCanvas).toHaveBeenCalledWith(warped)
    expect(url).toBe('data:image/jpeg;base64,WARPED')
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/editReceiptOcr.test.ts`
Expected: FAIL — `croppedDataUrl` und `mergeOcrIntoForm` sind noch nicht exportiert (`SyntaxError`/`undefined is not a function`).

- [ ] **Step 3: Helfer implementieren**

In `src/ui/EditReceipt.tsx` die beiden Funktionen exportieren. `warp` und `enhanceCanvas` werden bereits importiert (Zeilen 3-4); zusätzlich `Quad` importieren. Oben bei den Imports ergänzen:

```ts
import type { Receipt, Quad } from '../types'
```

(ersetzt `import type { Receipt } from '../types'`).

Direkt nach `buildReceiptFromForm` (nach `src/ui/EditReceipt.tsx:27`) einfügen:

```ts
export function croppedDataUrl(original: HTMLCanvasElement, quad: Quad): string {
  const w = warp(original, quad)
  enhanceCanvas(w)
  return w.toDataURL('image/jpeg', 0.85)
}

export function mergeOcrIntoForm(
  prev: FormFields,
  ocrText: string,
  extracted: { belegdatum: string | null; betrag: number | null; lieferant: string | null },
  touched: boolean,
): FormFields {
  if (touched) return { ...prev, ocrText }
  return {
    ...prev,
    ocrText,
    belegdatum: extracted.belegdatum ?? prev.belegdatum,
    betrag: extracted.betrag ?? prev.betrag,
    lieferant: extracted.lieferant ?? prev.lieferant,
  }
}
```

- [ ] **Step 4: Tests laufen lassen, grün bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/editReceiptOcr.test.ts`
Expected: PASS — alle vier Tests grün.

- [ ] **Step 5: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/ui/EditReceipt.tsx test/editReceiptOcr.test.ts
git commit -m "feat: add croppedDataUrl and mergeOcrIntoForm helpers"
```

---

### Task 3: `EditReceipt` verdrahten — OCR auf Zuschnitt + Re-OCR

**Files:**
- Modify: `src/ui/EditReceipt.tsx:31-83`

**Interfaces:**
- Consumes: `croppedDataUrl`, `mergeOcrIntoForm` (Task 2); `mountCropEditor(..., onChange?, onCommit?)` (Task 1); `recognizeFirstPage` (`src/ocr.ts:32`), `extractFields` (`src/ocr/extractFields.ts:28`).
- Produces: fertiges Verhalten — Initial-OCR läuft auf dem auto-zugeschnittenen Bild; Nachziehen einer Ecke löst Re-OCR aus (nur bei Ein-Seiten-Belegen); manuelle Feld-Edits (`belegdatum`/`betrag`/`lieferant`) werden über `touchedRef` geschützt.

- [ ] **Step 1: `touchedRef` + Re-OCR-Handler + geänderten useEffect einbauen**

In `src/ui/EditReceipt.tsx`, in der Komponente `EditReceipt` nach `const [tagInput, setTagInput] = useState('')` (Zeile 36) ergänzen:

```ts
  const touchedRef = useRef(false)

  async function runOcr(quad: import('../types').Quad) {
    try {
      const url = croppedDataUrl(pages[0].original, quad)
      const text = await recognizeFirstPage(url)
      setForm(prev => mergeOcrIntoForm(prev, text, extractFields(text), touchedRef.current))
    } catch { /* OCR optional */ }
  }
```

Den `useEffect` (Zeilen 38-49) ersetzen durch:

```ts
  useEffect(() => {
    if (!pages.length || !holderRef.current) return
    const last = pages.length - 1
    editorRef.current = mountCropEditor(
      holderRef.current, pages[last].original, pages[last].quad,
      undefined,
      quad => { if (pages.length === 1) void runOcr(quad) },
    )
    void runOcr(pages[0].quad)
    return () => editorRef.current?.destroy()
  }, [])
```

- [ ] **Step 2: `touched` in den Feld-Handlern setzen**

Die drei extrahierten Felder markieren bei manueller Eingabe `touchedRef`. In `src/ui/EditReceipt.tsx` die drei `onInput`-Handler anpassen:

Belegdatum (Zeile 70) — im `onInput` vor `setForm`:
```ts
onInput={e => { const v = (e.target as HTMLInputElement).value; if (!v) return; touchedRef.current = true; setForm(f => ({ ...f, belegdatum: v })) }}
```

Betrag (Zeile 71):
```ts
onInput={e => { touchedRef.current = true; setForm(f => ({ ...f, betrag: parseEuroToCents((e.target as HTMLInputElement).value) })) }}
```

Lieferant (Zeile 72):
```ts
onInput={e => { touchedRef.current = true; setForm(f => ({ ...f, lieferant: (e.target as HTMLInputElement).value })) }}
```

- [ ] **Step 3: Typecheck + volle Testsuite**

Run: `cd /home/alex/beleg-scanner && pnpm exec tsc --noEmit && pnpm vitest run`
Expected: PASS — keine Typfehler, alle bestehenden + neuen Tests grün (insb. `saveDraft.test.ts`, `cropEditor.test.ts`, `editReceiptOcr.test.ts`).

- [ ] **Step 4: Manueller Smoke am Dev-Server**

Run: `cd /home/alex/beleg-scanner && pnpm dev`
Prüfen (Browser/iPhone):
1. Datei/Foto wählen → Edit-Screen zeigt Crop-Editor.
2. Feldvorschläge (Datum/Betrag/Lieferant) erscheinen — sie stammen aus dem **zugeschnittenen** Bild (bei einem Foto mit sichtbarem Hintergrund plausibler als vorher).
3. Eine Ecke nachziehen + loslassen → Vorschläge aktualisieren sich.
4. Erst ein Feld manuell ändern, dann eine Ecke nachziehen → manueller Wert bleibt, nur `ocrText` (nicht sichtbar, aber im gespeicherten Beleg) ändert sich.
5. Speichern → im Archiv/Detail zeigt das PDF nur das Dokument.

- [ ] **Step 5: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/ui/EditReceipt.tsx
git commit -m "feat: run OCR on cropped document and re-OCR on crop adjustment"
```

---

## Self-Review

**Spec coverage:**
- „OCR auf Zuschnitt (Reihenfolge crop→OCR)" → Task 2 (`croppedDataUrl` + Test) + Task 3 (useEffect nutzt `runOcr`). ✓
- „cropEditor `onCommit` nur bei echtem Drag" → Task 1. ✓
- „Re-OCR bei Anpassung" → Task 3 (`onCommit`-Handler ruft `runOcr`). ✓
- „`touched`-Guard, ocrText immer / Felder nur wenn nicht angefasst" → Task 2 (`mergeOcrIntoForm` + Test) + Task 3 (Feld-Handler setzen `touchedRef`). ✓
- „Re-OCR nur wenn bearbeitete Seite = OCR-Ziel (Ein-Seiten)" → Task 3 (`if (pages.length === 1)`). ✓
- „save() unverändert" → nicht angefasst. ✓
- „Error Handling: OCR best effort" → `runOcr` in try/catch. ✓
- Tests (3 Bereiche laut Spec) → Task 1 (onCommit), Task 2 (croppedDataUrl-Reihenfolge, touched-Guard). ✓

**Placeholder scan:** keine TBD/TODO; alle Code-Schritte vollständig ausformuliert. ✓

**Type consistency:** `croppedDataUrl(HTMLCanvasElement, Quad): string`, `mergeOcrIntoForm(FormFields, string, {belegdatum|betrag|lieferant: …|null}, boolean): FormFields`, `mountCropEditor(..., onChange?, onCommit?)`, `runOcr(Quad)` — durchgängig identisch verwendet. `extractFields`-Rückgabe (`… | null`) passt zum `?? prev`-Fallback in `mergeOcrIntoForm`. ✓
