# Zuschnitt vor OCR (Erkennen → Bestätigen) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Edit-Screen zeigt den auto-erkannten Dokument-Rahmen als Vorschlag; nach Klick auf „Zuschnitt bestätigen" wird zugeschnitten (warp+enhance), die Vorschau zeigt nur das Dokument, und OCR läuft auf diesem Zuschnitt.

**Architecture:** Zwei-Zustands-UI (`frame` / `cropped`) in `EditReceipt`. Reine, testbare Helfer (`isFullFrame`, `croppedCanvas`, `mergeOcrIntoForm`) kapseln die Logik; der bestehende Crop-Editor bleibt unverändert und dient nur der optionalen Rahmen-Korrektur. Einziger OCR-Trigger ist die Bestätigung.

**Tech Stack:** TypeScript, Preact (hooks), Vite, Vitest (jsdom), jscanify/OpenCV (`warp`), Tesseract.js (`recognizeFirstPage`).

## Global Constraints

- Keine neuen Runtime-Dependencies (nur vorhandene Module).
- Tests laufen unter `jsdom`, Vitest-Globals aktiv (`vite.config.ts:36`); bestehende Testdateien importieren `describe/it/expect` dennoch explizit — diesem Stil folgen.
- OCR bleibt „best effort": jeder OCR-Aufruf in `try/catch`, Fehler dürfen das Formular nicht verändern.
- Kein Auto-OCR beim Mount und kein Re-OCR bei jedem Drag — einziger OCR-Trigger ist „Zuschnitt bestätigen".
- Conventional Commits (`feat:`, `test:`), keine AI-Attribution.

## File Structure

- `src/detect.ts` — **Modify.** Neue reine Funktion `isFullFrame`.
- `src/ui/EditReceipt.tsx` — **Modify.** Reine Helfer `croppedCanvas` + `mergeOcrIntoForm`; Zwei-Zustands-Komponente (`frame`/`cropped`) mit Bestätigen/Neu-zuschneiden, fullFrame-Hinweis, `touchedRef`, angepasstem `save()`.
- `test/detect.test.ts` — **Modify.** Test für `isFullFrame`.
- `test/editReceiptOcr.test.ts` — **Create.** Tests für `croppedCanvas` und `mergeOcrIntoForm`.

`src/cropEditor.ts` bleibt **unverändert** (der vorhandene Editor genügt für die optionale Korrektur).

---

### Task 1: `isFullFrame`-Prädikat in `detect.ts`

**Files:**
- Modify: `src/detect.ts` (nach `fullFrameQuad`, Zeile 22)
- Test: `test/detect.test.ts`

**Interfaces:**
- Consumes: `fullFrameQuad(w, h): Quad` (`src/detect.ts:15`), Typen `Quad`, `Point` (`src/types.ts`).
- Produces: `isFullFrame(quad: Quad, width: number, height: number): boolean` — `true`, wenn alle vier Ecken exakt `fullFrameQuad(width, height)` entsprechen.

- [ ] **Step 1: Failing-Test schreiben**

Ans Ende von `test/detect.test.ts` anfügen (Import um `isFullFrame`, `fullFrameQuad` erweitern):

```ts
import { isFullFrame, fullFrameQuad } from '../src/detect'

describe('isFullFrame', () => {
  it('erkennt den Vollbild-Quad als true', () => {
    expect(isFullFrame(fullFrameQuad(800, 600), 800, 600)).toBe(true)
  })
  it('erkennt einen echten Zuschnitt als false', () => {
    const quad = { topLeft: {x:10,y:20}, topRight: {x:790,y:15}, bottomRight: {x:780,y:590}, bottomLeft: {x:5,y:585} }
    expect(isFullFrame(quad, 800, 600)).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/detect.test.ts`
Expected: FAIL — `isFullFrame` ist nicht exportiert.

- [ ] **Step 3: `isFullFrame` implementieren**

In `src/detect.ts` direkt nach `fullFrameQuad` (nach Zeile 22) einfügen:

```ts
export function isFullFrame(quad: Quad, width: number, height: number): boolean {
  const f = fullFrameQuad(width, height)
  const eq = (a: Point, b: Point) => a.x === b.x && a.y === b.y
  return eq(quad.topLeft, f.topLeft) && eq(quad.topRight, f.topRight)
    && eq(quad.bottomRight, f.bottomRight) && eq(quad.bottomLeft, f.bottomLeft)
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/detect.test.ts`
Expected: PASS — bestehende `detect`-Tests + beide neuen grün.

- [ ] **Step 5: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/detect.ts test/detect.test.ts
git commit -m "feat: add isFullFrame predicate to detect empty detection"
```

---

### Task 2: Pure-Helfer `croppedCanvas` und `mergeOcrIntoForm`

**Files:**
- Modify: `src/ui/EditReceipt.tsx` (neue Exports nach `buildReceiptFromForm`, Zeile 27; Import `Quad`)
- Create: `test/editReceiptOcr.test.ts`

**Interfaces:**
- Consumes: `warp(canvas, quad): HTMLCanvasElement` (`src/detect.ts:132`), `enhanceCanvas(canvas): void` (`src/enhance.ts:23`), Typ `Quad` (`src/types.ts:6`), `FormFields` (`src/ui/EditReceipt.tsx:15`), Rückgabe von `extractFields`: `{ belegdatum: string | null; betrag: number | null; lieferant: string | null }` (`src/ocr/extractFields.ts:28`).
- Produces:
  - `croppedCanvas(original: HTMLCanvasElement, quad: Quad): HTMLCanvasElement` — `warp(original, quad)` zuerst, dann `enhanceCanvas` auf dem Warp-Ergebnis, gibt dieses Canvas zurück.
  - `mergeOcrIntoForm(prev: FormFields, ocrText: string, extracted: { belegdatum: string | null; betrag: number | null; lieferant: string | null }, touched: boolean): FormFields` — `ocrText` immer; Felder nur wenn `touched === false` (jeweils `?? prev`).

- [ ] **Step 1: Failing-Test schreiben**

`test/editReceiptOcr.test.ts` neu anlegen:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/detect', () => ({
  warp: vi.fn((c: HTMLCanvasElement) => {
    const w = document.createElement('canvas')
    ;(w as any).__warpedFrom = c
    return w
  }),
}))
vi.mock('../src/enhance', () => ({ enhanceCanvas: vi.fn() }))

import { croppedCanvas, mergeOcrIntoForm, type FormFields } from '../src/ui/EditReceipt'
import { warp } from '../src/detect'
import { enhanceCanvas } from '../src/enhance'

const QUAD = { topLeft: {x:0,y:0}, topRight: {x:10,y:0}, bottomRight: {x:10,y:10}, bottomLeft: {x:0,y:10} }

describe('croppedCanvas', () => {
  it('warpt zuerst, enhanct das Warp-Ergebnis und gibt es zurück', () => {
    const original = document.createElement('canvas')
    const out = croppedCanvas(original, QUAD)
    expect(warp).toHaveBeenCalledWith(original, QUAD)
    const warped = (warp as any).mock.results[0].value
    expect(enhanceCanvas).toHaveBeenCalledWith(warped)
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
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/editReceiptOcr.test.ts`
Expected: FAIL — `croppedCanvas`/`mergeOcrIntoForm` nicht exportiert.

- [ ] **Step 3: Helfer implementieren**

In `src/ui/EditReceipt.tsx` den Typ-Import erweitern (ersetzt `import type { Receipt } from '../types'`, Zeile 11):

```ts
import type { Receipt, Quad } from '../types'
```

Direkt nach `buildReceiptFromForm` (nach Zeile 27) einfügen:

```ts
export function croppedCanvas(original: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const w = warp(original, quad)
  enhanceCanvas(w)
  return w
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

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `cd /home/alex/beleg-scanner && pnpm vitest run test/editReceiptOcr.test.ts`
Expected: PASS — alle vier Tests grün.

- [ ] **Step 5: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/ui/EditReceipt.tsx test/editReceiptOcr.test.ts
git commit -m "feat: add croppedCanvas and mergeOcrIntoForm helpers"
```

---

### Task 3: `EditReceipt` — Zwei-Zustands-Flow (Bestätigen → Zuschnitt → OCR)

**Files:**
- Modify: `src/ui/EditReceipt.tsx:1-83`

**Interfaces:**
- Consumes: `croppedCanvas`, `mergeOcrIntoForm` (Task 2); `isFullFrame` (Task 1); `mountCropEditor` (`src/cropEditor.ts:19`), `recognizeFirstPage` (`src/ocr.ts:32`), `extractFields` (`src/ocr/extractFields.ts:28`), `warp`/`enhanceCanvas`.
- Produces: fertiges Verhalten laut Spec — Rahmen-Vorschlag → Bestätigen → Zuschnitt-Vorschau + OCR → optional „Neu zuschneiden"; `touched`-Guard; `save()` nutzt bestätigten Zuschnitt.

- [ ] **Step 1: Imports ergänzen**

In `src/ui/EditReceipt.tsx` die Import-Zeilen anpassen:

```ts
import { mountCropEditor } from '../cropEditor'
import { warp, isFullFrame } from '../detect'
```

(ergänzt `isFullFrame`; `warp` bleibt.) `enhanceCanvas` (Zeile 4) bleibt für Nicht-letzte-Seiten in `save()`.

- [ ] **Step 2: Komponenten-State und Refs umbauen**

Den Kopf der Komponente `EditReceipt` (Zeilen 31-36) ersetzen durch:

```ts
export function EditReceipt() {
  const pages = draftPages.value
  const holderRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ getQuad(): Quad; destroy(): void } | null>(null)
  const quadRef = useRef<Quad | null>(null)
  const croppedRef = useRef<HTMLCanvasElement | null>(null)
  const touchedRef = useRef(false)
  const [mode, setMode] = useState<'frame' | 'cropped'>('frame')
  const [noDetection, setNoDetection] = useState(false)
  const [form, setForm] = useState<FormFields>({ belegdatum: todayIso(), betrag: null, lieferant: '', kategorie: 'Sonstiges', tags: [], notiz: '', ocrText: '' })
  const [tagInput, setTagInput] = useState('')
```

- [ ] **Step 3: Mount-Effekt + `confirmCrop` einbauen**

Den bestehenden `useEffect` (Zeilen 38-49) ersetzen durch den mode-gekoppelten Effekt plus `confirmCrop`:

```ts
  useEffect(() => {
    if (!pages.length || !holderRef.current) return
    const holder = holderRef.current
    const last = pages[pages.length - 1]
    if (quadRef.current === null) {
      quadRef.current = last.quad
      setNoDetection(isFullFrame(last.quad, last.original.width, last.original.height))
    }
    if (mode === 'frame') {
      editorRef.current = mountCropEditor(holder, last.original, quadRef.current)
      return () => {
        quadRef.current = editorRef.current?.getQuad() ?? quadRef.current
        editorRef.current?.destroy()
        editorRef.current = null
      }
    }
    // mode === 'cropped'
    const cropped = croppedRef.current
    if (cropped) {
      holder.innerHTML = ''
      cropped.style.width = '100%'
      cropped.style.display = 'block'
      holder.appendChild(cropped)
    }
  }, [mode])

  async function confirmCrop() {
    const last = pages[pages.length - 1]
    const quad = editorRef.current?.getQuad() ?? quadRef.current ?? last.quad
    quadRef.current = quad
    croppedRef.current = croppedCanvas(last.original, quad)
    setMode('cropped')
    try {
      const text = await recognizeFirstPage(croppedRef.current.toDataURL('image/jpeg', 0.85))
      setForm(prev => mergeOcrIntoForm(prev, text, extractFields(text), touchedRef.current))
    } catch { /* OCR optional */ }
  }
```

- [ ] **Step 4: `save()` auf bestätigten Zuschnitt umstellen**

Die `save()`-Funktion (Zeilen 51-62) ersetzen durch:

```ts
  async function save() {
    const lastIdx = pages.length - 1
    const finalPages = pages.map((p, i) => {
      if (i === lastIdx) {
        return croppedRef.current ?? croppedCanvas(p.original, quadRef.current ?? p.quad)
      }
      const w = warp(p.original, p.quad)
      enhanceCanvas(w)
      return w
    })
    const r = buildReceiptFromForm({ pages: finalPages, form, now: Date.now(), id: `r${Date.now()}` })
    await saveReceipt(r)
    draftPages.value = []
    goto('archive')
  }
```

- [ ] **Step 5: JSX — Vorschau/Hinweis/Buttons anpassen**

Den `return (...)`-Block (Zeilen 66-83) ersetzen durch:

```tsx
  if (!pages.length) { goto('scan'); return null }
  return (
    <div class="edit" style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <div ref={holderRef} class="card" />
      {mode === 'frame' && noDetection &&
        <p class="hint" style="color:var(--color-danger,#c00);margin:0">Kein Dokument erkannt – Rahmen bitte anpassen.</p>}
      {mode === 'frame'
        ? <Button onClick={confirmCrop}>Zuschnitt bestätigen</Button>
        : <Button variant="secondary" onClick={() => setMode('frame')}>Neu zuschneiden</Button>}
      {mode === 'cropped' &&
        <div class="card">
          <Field label="Belegdatum"><input type="date" value={form.belegdatum} onInput={e => { const v = (e.target as HTMLInputElement).value; if (!v) return; touchedRef.current = true; setForm(f => ({ ...f, belegdatum: v })) }} /></Field>
          <Field label="Betrag (€)"><input inputMode="decimal" value={form.betrag !== null ? (form.betrag/100).toFixed(2).replace('.', ',') : ''} onInput={e => { touchedRef.current = true; setForm(f => ({ ...f, betrag: parseEuroToCents((e.target as HTMLInputElement).value) })) }} /></Field>
          <Field label="Lieferant"><input value={form.lieferant} onInput={e => { touchedRef.current = true; setForm(f => ({ ...f, lieferant: (e.target as HTMLInputElement).value })) }} /></Field>
          <Field label="Kategorie"><input value={form.kategorie} onInput={e => setForm(f => ({ ...f, kategorie: (e.target as HTMLInputElement).value }))} /></Field>
          <Field label="Tags"><input value={tagInput} onInput={e => setTagInput((e.target as HTMLInputElement).value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} /></Field>
          <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">{form.tags.map(t => <span class="chip">{t}</span>)}</div>
          <Field label="Notiz"><textarea value={form.notiz} onInput={e => setForm(f => ({ ...f, notiz: (e.target as HTMLTextAreaElement).value }))} /></Field>
        </div>}
      <div style="display:flex;gap:var(--sp-3)">
        <Button onClick={save} disabled={mode === 'frame'}>Speichern</Button>
        <Button variant="ghost" onClick={() => { draftPages.value = []; goto('scan') }}>Verwerfen</Button>
      </div>
    </div>
  )
```

Hinweis: Das Metadaten-Formular ist erst im Zustand `cropped` sichtbar; „Speichern" ist in `frame` deaktiviert (erst nach Bestätigung). `addTag` (Zeile 63) bleibt unverändert.

- [ ] **Step 6: Typecheck + volle Testsuite**

Run: `cd /home/alex/beleg-scanner && pnpm exec tsc --noEmit && pnpm vitest run`
Expected: PASS — keine Typfehler; alle Tests grün (`detect`, `editReceiptOcr`, `saveDraft`, `cropEditor`, restliche Suite).

- [ ] **Step 7: Manueller Smoke am Dev-Server**

Run: `cd /home/alex/beleg-scanner && pnpm dev`
Prüfen (Browser/iPhone):
1. Foto/Datei wählen → Edit-Screen zeigt Original mit auto-erkanntem Rahmen; „Speichern" ist deaktiviert.
2. Bild ohne erkennbares Dokument → Hinweis „Kein Dokument erkannt …".
3. „Zuschnitt bestätigen" → Vorschau zeigt nur das zugeschnittene Dokument; Feldvorschläge (Datum/Betrag/Lieferant) erscheinen; Button = „Neu zuschneiden".
4. Ein Feld manuell ändern → „Neu zuschneiden" → Rahmen anpassen → erneut bestätigen: manueller Wert bleibt, Vorschläge der übrigen Felder aktualisieren sich.
5. „Speichern" → im Detail/Archiv zeigt das PDF nur das Dokument.

- [ ] **Step 8: Commit**

```bash
cd /home/alex/beleg-scanner
git add src/ui/EditReceipt.tsx
git commit -m "feat: confirm-crop step with cropped preview and OCR on confirmation"
```

---

## Self-Review

**Spec coverage:**
- „Auto-Rahmen als Vorschlag, kein Pflicht-Ziehen" → Task 3 (Editor mit `pages[last].quad` vorbelegt). ✓
- „Zustand frame / cropped" → Task 3 (`mode`-State, mode-gekoppelter Effekt). ✓
- „Hinweis wenn nichts erkannt (fullFrameQuad)" → Task 1 (`isFullFrame`) + Task 3 (`noDetection`, Hinweis-JSX). ✓
- „Bestätigen → warp+enhance → Vorschau nur Dokument" → Task 2 (`croppedCanvas`) + Task 3 (`confirmCrop`, cropped-Vorschau). ✓
- „OCR erst nach Bestätigung, einziger Trigger" → Task 3 (`confirmCrop`, kein Mount-/Drag-OCR). ✓
- „Neu zuschneiden → zurück zu frame, erneut bestätigen" → Task 3 (Button setzt `mode='frame'`). ✓
- „touched-Guard" → Task 2 (`mergeOcrIntoForm`) + Task 3 (`touchedRef` in Feld-Handlern). ✓
- „save() nutzt bestätigten Zuschnitt" → Task 3 (`croppedRef`-Reuse). ✓
- „Error Handling OCR best effort / leere pages" → Task 3 (`try/catch`, bestehender `goto('scan')`-Guard). ✓
- Tests (3 Bereiche) → Task 1 (isFullFrame), Task 2 (croppedCanvas, mergeOcrIntoForm). ✓

**Placeholder scan:** keine TBD/TODO; alle Code-Schritte vollständig. ✓

**Type consistency:** `isFullFrame(Quad, number, number): boolean`, `croppedCanvas(HTMLCanvasElement, Quad): HTMLCanvasElement`, `mergeOcrIntoForm(FormFields, string, {…|null}, boolean): FormFields`, `quadRef: Quad|null`, `croppedRef: HTMLCanvasElement|null`, `mode: 'frame'|'cropped'` — durchgängig konsistent. `extractFields`-Rückgabe (`…|null`) passt zum `?? prev` in `mergeOcrIntoForm`. `editorRef.getQuad(): Quad` passt zu `quadRef`. ✓
