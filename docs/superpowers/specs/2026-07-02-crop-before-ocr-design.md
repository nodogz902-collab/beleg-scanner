# Zuschnitt vor OCR (Erkennen → Bestätigen) — Design

**Datum:** 2026-07-02
**Repo:** beleg-scanner (Branch `feat/v2-belegablage`)
**Status:** freigegeben, bereit für Implementierungsplan

## Problem

Im Edit-Screen läuft die Texterkennung (OCR = „Scan des PDF-Inhaltes")
aktuell auf dem **vollen, ungeschnittenen Kamerabild** (`pages[0].original`,
`EditReceipt.tsx:43`). Die perspektivische Entzerrung + Kontrast
(`warp` + `enhanceCanvas`) wird erst **beim Speichern** angewandt
(`EditReceipt.tsx:52-57`). Dadurch liest OCR Hintergrund/Ränder mit, und es
gibt keinen klaren Moment, in dem der Nutzer den **automatisch erkannten
Zuschnitt bestätigt**, bevor verarbeitet wird.

## Ziel

Das Produkt erkennt das Dokument automatisch (existiert bereits via
`detectQuad`) und zeigt den Rahmen als **Vorschlag**. Der Nutzer muss den
Rahmen **nicht selbst ziehen** — er **bestätigt** nur, dass korrekt erkannt
wurde. Erst nach der Bestätigung wird zugeschnitten, OCR läuft auf dem sauberen
Zuschnitt, dann folgt das Metadaten-Formular. Das PDF entsteht aus dem
bestätigten Zuschnitt.

Nicht-Ziele (YAGNI): kein separater Zuschnitt-Screen (Bestätigung passiert auf
dem bestehenden Edit-Screen), keine Änderung am Erkennungsalgorithmus selbst.

## Ablauf: Zwei Zustände auf dem Edit-Screen

### Zustand „frame" (beim Öffnen)
- Crop-Editor zeigt das **Original** mit dem **auto-erkannten Rahmen**
  (`pages[last].quad` aus `detectQuad`) — vorbelegt, kein Pflicht-Ziehen.
- Erkennung fehlgeschlagen (Rahmen == ganzes Bild, `fullFrameQuad`): Hinweis
  **„Kein Dokument erkannt – Rahmen bitte anpassen"**.
- Button **„Zuschnitt bestätigen"**. OCR läuft hier **noch nicht**.
- Der Nutzer kann den Rahmen optional korrigieren (bestehender Crop-Editor).

### Zustand „cropped" (nach Bestätigung)
- `warp` + `enhanceCanvas` werden auf den aktuellen Rahmen angewandt; die
  Vorschau schaltet auf das **zugeschnittene Bild** um (Handles verschwinden) —
  „wirklich nur das Dokument".
- **OCR** läuft auf genau diesem Zuschnitt → Metadaten-Formular füllt sich
  (Belegdatum, Betrag, Lieferant).
- Button wird zu **„Neu zuschneiden"** → zurück zu „frame" mit dem zuletzt
  gesetzten Rahmen. Erneute Bestätigung lässt OCR erneut laufen.

## Architektur / betroffene Units

### 1. `src/detect.ts` — `isFullFrame`
Reine Prädikatsfunktion, um den „nichts erkannt"-Fall zu erkennen:

```
isFullFrame(quad: Quad, width: number, height: number): boolean
```
Vergleicht `quad` mit `fullFrameQuad(width, height)` (alle vier Ecken gleich).

### 2. `src/ui/EditReceipt.tsx` — reine Helfer
- `croppedCanvas(original: HTMLCanvasElement, quad: Quad): HTMLCanvasElement`
  — `warp(original, quad)` → `enhanceCanvas(w)` → gibt das Canvas zurück
  (wird für Vorschau, OCR-DataURL **und** PDF-Speicherung wiederverwendet).
- `mergeOcrIntoForm(prev, ocrText, extracted, touched): FormFields`
  — setzt `ocrText` immer; füllt `belegdatum/betrag/lieferant` nur wenn
  `touched === false` (jeweils `?? prev`-Fallback).

### 3. `src/ui/EditReceipt.tsx` — Komponente
- `mode: 'frame' | 'cropped'` (State), Start `'frame'`.
- Refs: `quadRef` (aktueller Rahmen), `croppedRef` (bestätigtes Zuschnitt-Canvas),
  `touchedRef` (bool), `editorRef` (Crop-Editor-Handle).
- **Mount-Effekt (keyed auf `mode`):** in „frame" den Crop-Editor auf
  `pages[last].original` + `quadRef` mounten; in „cropped" das `croppedRef`-Canvas
  in den Holder rendern. Beim Verlassen von „frame" den Editor-Quad in `quadRef`
  sichern und `destroy()`.
- **`confirmCrop()`:** Quad aus Editor lesen → `quadRef` → `croppedCanvas` →
  `croppedRef` → `setMode('cropped')` → OCR (`recognizeFirstPage` auf
  `croppedRef.toDataURL('image/jpeg', 0.85)`) → `mergeOcrIntoForm`.
- **`touchedRef`:** wird `true`, sobald der Nutzer Belegdatum/Betrag/Lieferant
  manuell ändert → schützt manuelle Werte bei erneutem Zuschnitt/OCR.
- **`save()`:** letzte Seite nutzt `croppedRef` (bereits gewarpt+enhanct) statt
  neu zu warpen; ist noch nicht bestätigt, `croppedCanvas(original, quadRef)`.
  Übrige Seiten unverändert (`warp` + `enhanceCanvas`).
- **Kein Auto-OCR beim Mount** und **kein Re-OCR bei jedem Drag** — einziger
  OCR-Trigger ist „Zuschnitt bestätigen".

## Datenfluss (nachher)

```
Scan → detectQuad → draftPages[{original, quad}] → edit (mode='frame')
  ↓ Rahmen-Vorschlag angezeigt; ggf. Hinweis wenn isFullFrame
  ↓ Nutzer bestätigt (confirmCrop)
warp+enhance → croppedRef → Vorschau (mode='cropped') → OCR → Formular
  ↓ optional „Neu zuschneiden" → mode='frame' → erneut bestätigen → OCR (touched-Guard)
  ↓ save
letzte Seite = croppedRef, übrige = warp+enhance → buildPdf
```

## Error Handling
- OCR bleibt „best effort": `try/catch`, Fehler ändern das Formular nicht.
- `warp`/`enhanceCanvas` haben eigene Fallbacks (`warp` gibt bei Fehler das
  Original zurück, `detect.ts:148-151`).
- Leere `pages` (Direktaufruf): bestehender Guard `goto('scan')`
  (`EditReceipt.tsx:65`) bleibt; Refs greifen erst im Effekt auf `pages` zu.

## Tests
1. **`isFullFrame`** (`test/detect.test.ts`): `true` für `fullFrameQuad`, `false`
   für einen echten Zuschnitt-Quad.
2. **`croppedCanvas`** (`test/editReceiptOcr.test.ts`, `warp`/`enhance` gemockt):
   `warp` zuerst mit Original+Quad, `enhanceCanvas` auf dem Warp-Ergebnis,
   Rückgabe = dieses Canvas.
3. **`mergeOcrIntoForm`**: füllt Felder bei `touched=false`; `null`-Werte fallen
   auf `prev` zurück; bei `touched=true` nur `ocrText`, Felder unangetastet.

## Verifikation
`pnpm exec tsc --noEmit && pnpm vitest run` grün + manueller Smoke:
Foto → Rahmen-Vorschlag (bzw. Hinweis) → „Zuschnitt bestätigen" → Vorschau zeigt
nur das Dokument + Feldvorschläge → Feld ändern, „Neu zuschneiden", erneut
bestätigen → manueller Wert bleibt → Speichern → PDF zeigt nur das Dokument.
