# Zuschnitt vor OCR — Design

**Datum:** 2026-07-02
**Repo:** beleg-scanner (Branch `feat/v2-belegablage`)
**Status:** freigegeben, bereit für Implementierungsplan

## Problem

Im Edit-Screen läuft die Texterkennung (OCR = „Scan des PDF-Inhaltes")
aktuell auf dem **vollen, ungeschnittenen Kamerabild** (`pages[0].original`,
`EditReceipt.tsx:43`). Die perspektivische Entzerrung + Kontrast
(`warp` + `enhanceCanvas`) wird erst **beim Speichern** angewandt
(`EditReceipt.tsx:52-57`). Dadurch liest OCR Hintergrund/Ränder mit und die
Feld-Extraktion (Datum, Betrag, Lieferant) ist schlechter als nötig.

## Ziel

Reihenfolge im Edit-Screen umkehren: **(auto) zuschneiden → OCR → Formular.**
OCR liest nur noch das entzerrte, zugeschnittene Dokument. Das finale PDF
entsteht unverändert aus dem Zuschnitt (`save()` bleibt inhaltlich gleich).

Nicht-Ziele (YAGNI): kein neuer separater Zuschnitt-Screen, keine Änderung der
Auto-Erkennung selbst, kein Re-OCR bei jedem Pixel-Move.

## Architektur / betroffene Units

### 1. `src/cropEditor.ts` — Commit-Event

`mountCropEditor` bekommt einen zusätzlichen optionalen Callback:

```
onCommit?: (q: Quad) => void
```

- Gefeuert in `onUp`, **nur wenn** während des aktuellen Pointer-Gestens
  tatsächlich ein Eckpunkt bewegt wurde (Flag `dragged`, gesetzt in `onMove`,
  zurückgesetzt in `onDown`).
- `onChange` (feuert bei jedem Move) bleibt unverändert erhalten.
- Vertrag: `onCommit` liefert denselben Quad-Snapshot wie `getQuad()`.

Damit löst nur das **Loslassen nach einer echten Anpassung** ein Re-OCR aus,
nicht jede Zwischenbewegung.

### 2. `src/ui/EditReceipt.tsx` — OCR auf dem Zuschnitt

**Neuer lokaler Helper:**

```
function croppedDataUrl(page: DraftPage, quad: Quad): string {
  const w = warp(page.original, quad)
  enhanceCanvas(w)
  return w.toDataURL('image/jpeg', 0.85)
}
```

**Initial-OCR (useEffect):** statt `pages[0].original.toDataURL(...)` wird
`croppedDataUrl(ocrPage, ocrPageQuad)` an `recognizeFirstPage` übergeben.
- OCR-Ziel bleibt die erste Seite (`pages[0]`) — konsistent mit der bisherigen
  `recognizeFirstPage`-Semantik. In der Praxis (Ein-Seiten-Belege) ist das
  zugleich die im Editor bearbeitete Seite.
- Verwendet den auto-erkannten Quad aus `pages[0].quad` bzw. — falls der
  Editor dieselbe Seite bearbeitet — den aktuellen Editor-Quad.

**Re-OCR bei Anpassung:** `mountCropEditor(..., onCommit)` wird verdrahtet.
`onCommit(newQuad)` → `croppedDataUrl(editedPage, newQuad)` → `recognizeFirstPage`
→ Formular-Merge (siehe `touched`-Guard). Läuft nur, wenn die im Editor
bearbeitete Seite auch das OCR-Ziel ist (Ein-Seiten-Fall).

### 3. `src/ui/EditReceipt.tsx` — `touched`-Guard gegen Überschreiben

Ziel: Manuelle Feld-Korrekturen dürfen von einem späteren Re-OCR nicht
zerstört werden.

- Ein Ref/Flag `touchedRef` (bool), gesetzt sobald der Nutzer eines der
  extrahierten Felder (Belegdatum, Betrag, Lieferant) manuell ändert.
- **Merge-Regel bei OCR-Ergebnis:**
  - `ocrText` wird **immer** aktualisiert (roher Erkennungstext).
  - Datum / Betrag / Lieferant werden **nur** aus dem OCR-Vorschlag gefüllt,
    wenn `touchedRef === false`. Danach bleiben sie unangetastet.
- Das Initial-OCR läuft praktisch immer mit `touched === false` (Nutzer hatte
  noch keine Chance zu tippen), verhält sich also wie bisher.

## Datenfluss (nachher)

```
Scan → detectQuad → draftPages[{original, quad}] → edit
  ↓ (useEffect)
warp(original, quad) + enhance → dataUrl → OCR → extractFields → Formular
  ↓ (Nutzer zieht Ecke nach → onCommit)
warp(original, neuerQuad) + enhance → dataUrl → OCR → Merge (touched-Guard)
  ↓ (save)
warp + enhance je Seite → buildPdf   [unverändert]
```

## Error Handling

- OCR bleibt „best effort": `try/catch` um Initial- und Re-OCR, Fehler ändern
  das Formular nicht (wie bisher, `EditReceipt.tsx:46`).
- `warp`/`enhanceCanvas` haben eigene Fallbacks (`warp` gibt bei Fehler das
  Original-Canvas zurück, `detect.ts:148-151`) — kein zusätzliches Handling nötig.
- Doppeltes Re-OCR: greift der Nutzer währenddessen erneut, ist ein einfacher
  „letzter gewinnt"-Effekt akzeptabel (kein Abbruch-Handling nötig, da OCR
  idempotent auf das jeweils übergebene Bild wirkt).

## Tests

Bestehende Suites erweitern (`test/cropEditor.test.ts`, ggf. neuer
`EditReceipt`-Test):

1. **cropEditor `onCommit`**: feuert bei Down→Move→Up genau einmal; feuert
   **nicht** bei Down→Up ohne Move.
2. **Reihenfolge crop→OCR**: `warp` + `recognizeFirstPage` gemockt; Assert, dass
   `recognizeFirstPage` mit dem Ergebnis von `warp`/`enhance` (nicht dem
   Original) aufgerufen wird.
3. **`touched`-Guard**: Nach manuellem Setzen eines Feldes überschreibt ein
   Re-OCR-Ergebnis dieses Feld nicht, aktualisiert aber `ocrText`.

## Verifikation

`pnpm test` (Vitest) grün + manueller Smoke am Dev-Server bzw. iPhone
(Foto → Auto-Zuschnitt → Feldvorschläge aus Zuschnitt → Ecke nachziehen →
Vorschläge aktualisieren sich, manuelle Edits bleiben erhalten → Speichern →
PDF zeigt nur das Dokument).
