# Beleg-Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine installierbare iOS-taugliche Web-App, die per Kamera ein Dokument fotografiert, halb-automatisch zuschneidet/entzerrt, mehrere Seiten zu einem PDF bündelt und dieses per iOS-Share-Sheet teilt.

**Architecture:** Vanilla TypeScript + Vite. Eine schlanke Verarbeitungs-Pipeline (`detect → crop → enhance → pages → pdf`) liegt hinter dünnen Interfaces und ist mit einem Fixture-Bild headless testbar; Kamera, Share und OpenCV/Tesseract-WASM sind gekapselt und werden lazy geladen. Deploy als PWA auf GitHub Pages.

**Tech Stack:** Vite, TypeScript, Vitest, jscanify (+ OpenCV.js), Tesseract.js, jsPDF, vite-plugin-pwa.

## Global Constraints

- Ziel-Plattform: **iOS Safari 15+**; App muss unter **HTTPS** laufen (Kamera via `getUserMedia`).
- **Node 22**, npm.
- Kein UI-Framework (Bundle klein halten neben WASM + OCR-Modell).
- Vite `base` = `/beleg-scanner/` (GitHub-Pages-Projektpfad).
- OpenCV.js und Tesseract-Modell **lazy laden** und im Service-Worker cachen.
- OCR-Sprache: **Deutsch** (`deu`).
- **Kein Backend, keine Persistenz** über die Session hinaus.
- Default-Dateiname: `Beleg-<YYYY-MM-DD>.pdf`.
- Repo/Host: privater GitHub-Account `nodogz902-collab`, Git-Identität lokal im Repo gesetzt.
- Conventional Commits (`feat:`, `test:`, `chore:`, `docs:`), keine AI-Attribution in Commits.

---

### Task 1: Projekt-Scaffold (Vite + TS + Vitest)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`, `test/smoke.test.ts`, `.gitignore`

**Interfaces:**
- Consumes: nichts
- Produces: lauffähiges Vite-Projekt (`npm run dev`) und Vitest-Runner (`npm test`).

- [ ] **Step 1: `package.json` anlegen**

```json
{
  "name": "beleg-scanner",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "jscanify": "^1.3.0",
    "jspdf": "^2.5.2",
    "tesseract.js": "^5.1.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` anlegen**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "vitest/globals"],
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: `vite.config.ts` anlegen** (PWA-Plugin folgt in Task 11 — hier nur Basis)

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/beleg-scanner/',
  test: { environment: 'jsdom', globals: true },
})
```

Hinweis: `jsdom` als Dev-Dependency ergänzen: `npm i -D jsdom`.

- [ ] **Step 4: `index.html` + `src/main.ts` + `src/styles.css` anlegen**

`index.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no" />
    <title>Beleg-Scanner</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
const app = document.querySelector<HTMLDivElement>('#app')!
app.textContent = 'Beleg-Scanner'
```

`src/styles.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, sans-serif; }
```

- [ ] **Step 5: Smoke-Test anlegen** — `test/smoke.test.ts`

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('läuft', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 6: `.gitignore` anlegen**

```
node_modules
dist
dev-dist
```

- [ ] **Step 7: Installieren und Test laufen lassen**

Run: `cd /home/alex/beleg-scanner && npm install && npm test`
Expected: Vitest meldet 1 passing test.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite + typescript + vitest project"
```

---

### Task 2: Typen + Seiten-Store (`pages.ts`)

**Files:**
- Create: `src/types.ts`, `src/pages.ts`, `test/pages.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `src/types.ts`: `interface Point { x: number; y: number }`, `interface Quad { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point }`, `interface Page { id: string; image: Blob; width: number; height: number; thumbnailUrl: string }`
  - `src/pages.ts`: `class PageStore` mit `add(page: Omit<Page,'id'>): Page`, `remove(id: string): void`, `move(id: string, direction: -1 | 1): void`, `list(): Page[]`, `count(): number`, `clear(): void`.

- [ ] **Step 1: Failing Test schreiben** — `test/pages.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PageStore } from '../src/pages'

function fakePage(tag: string) {
  return { image: new Blob([tag]), width: 100, height: 200, thumbnailUrl: `data:${tag}` }
}

describe('PageStore', () => {
  let store: PageStore
  beforeEach(() => { store = new PageStore() })

  it('add vergibt eindeutige ids und zählt', () => {
    const a = store.add(fakePage('a'))
    const b = store.add(fakePage('b'))
    expect(a.id).not.toBe(b.id)
    expect(store.count()).toBe(2)
  })

  it('remove löscht die richtige Seite', () => {
    const a = store.add(fakePage('a'))
    store.add(fakePage('b'))
    store.remove(a.id)
    expect(store.count()).toBe(1)
    expect(store.list()[0].thumbnailUrl).toBe('data:b')
  })

  it('move tauscht die Reihenfolge', () => {
    const a = store.add(fakePage('a'))
    const b = store.add(fakePage('b'))
    store.move(b.id, -1)
    expect(store.list().map(p => p.id)).toEqual([b.id, a.id])
  })

  it('move an den Rändern ist ein no-op', () => {
    const a = store.add(fakePage('a'))
    store.move(a.id, -1)
    expect(store.list()[0].id).toBe(a.id)
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- pages`
Expected: FAIL (`PageStore` nicht gefunden).

- [ ] **Step 3: `src/types.ts` implementieren**

```ts
export interface Point { x: number; y: number }
export interface Quad { topLeft: Point; topRight: Point; bottomRight: Point; bottomLeft: Point }
export interface Page {
  id: string
  image: Blob
  width: number
  height: number
  thumbnailUrl: string
}
```

- [ ] **Step 4: `src/pages.ts` implementieren**

```ts
import type { Page } from './types'

export class PageStore {
  private pages: Page[] = []
  private seq = 0

  add(page: Omit<Page, 'id'>): Page {
    const full: Page = { ...page, id: `p${++this.seq}` }
    this.pages.push(full)
    return full
  }

  remove(id: string): void {
    this.pages = this.pages.filter(p => p.id !== id)
  }

  move(id: string, direction: -1 | 1): void {
    const i = this.pages.findIndex(p => p.id === id)
    if (i < 0) return
    const j = i + direction
    if (j < 0 || j >= this.pages.length) return
    ;[this.pages[i], this.pages[j]] = [this.pages[j], this.pages[i]]
  }

  list(): Page[] { return [...this.pages] }
  count(): number { return this.pages.length }
  clear(): void { this.pages = []; this.seq = 0 }
}
```

- [ ] **Step 5: Test laufen lassen (muss bestehen)**

Run: `npm test -- pages`
Expected: PASS (4 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/pages.ts test/pages.test.ts
git commit -m "feat: add page store and shared types"
```

---

### Task 3: Bildaufbereitung (`enhance.ts`)

**Files:**
- Create: `src/enhance.ts`, `test/enhance.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `autoContrast(data: Uint8ClampedArray): void` — streckt RGB-Werte linear auf [0,255] anhand des globalen Min/Max über alle RGB-Kanäle (Alpha bleibt unangetastet). Mutiert das Array in-place.

- [ ] **Step 1: Failing Test schreiben** — `test/enhance.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { autoContrast } from '../src/enhance'

describe('autoContrast', () => {
  it('streckt Min→0 und Max→255', () => {
    // zwei Pixel: (50,50,50,255) und (100,100,100,255)
    const data = new Uint8ClampedArray([50, 50, 50, 255, 100, 100, 100, 255])
    autoContrast(data)
    expect(data[0]).toBe(0)
    expect(data[4]).toBe(255)
    expect(data[3]).toBe(255) // Alpha unverändert
    expect(data[7]).toBe(255)
  })

  it('konstantes Bild bleibt unverändert (keine Division durch 0)', () => {
    const data = new Uint8ClampedArray([120, 120, 120, 255])
    autoContrast(data)
    expect(data[0]).toBe(120)
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- enhance`
Expected: FAIL (`autoContrast` nicht gefunden).

- [ ] **Step 3: `src/enhance.ts` implementieren**

```ts
/** Lineare Kontrast-Streckung über alle RGB-Kanäle, in-place. Alpha bleibt. */
export function autoContrast(data: Uint8ClampedArray): void {
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const range = max - min
  if (range === 0) return
  const scale = 255 / range
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.round((data[i + c] - min) * scale)
    }
  }
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- enhance`
Expected: PASS (2 Tests).

- [ ] **Step 5: Canvas-Wrapper ergänzen** (kein eigener Unit-Test — nutzt Browser-Canvas)

In `src/enhance.ts` anhängen:
```ts
/** Wendet autoContrast auf ein Canvas an (Browser). */
export function enhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  autoContrast(img.data)
  ctx.putImageData(img, 0, 0)
}
```

- [ ] **Step 6: Commit**

```bash
git add src/enhance.ts test/enhance.test.ts
git commit -m "feat: add auto-contrast image enhancement"
```

---

### Task 4: PDF-Erzeugung (`pdf.ts`)

**Files:**
- Create: `src/pdf.ts`, `test/pdf.test.ts`, `test/fixtures.ts`

**Interfaces:**
- Consumes: `Page` aus `src/types.ts`
- Produces: `buildPdf(images: string[]): Blob` — nimmt eine Liste von JPEG-Data-URLs (eine pro Seite), erzeugt ein A4-PDF (jede Seite = ein bildfüllendes Blatt) und gibt einen `application/pdf`-Blob zurück. Zusätzlich `pdfPageCount(blob: Blob): Promise<number>` als Testhilfe (zählt `/Type /Page`-Vorkommen im PDF-Text).

- [ ] **Step 1: Fixture anlegen** — `test/fixtures.ts` (winziges gültiges 1×1-JPEG als Data-URL)

```ts
// 1x1 JPEG (weiß), Base64
export const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AvwA//9k='
```

- [ ] **Step 2: Failing Test schreiben** — `test/pdf.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildPdf, pdfPageCount } from '../src/pdf'
import { TINY_JPEG } from './fixtures'

describe('buildPdf', () => {
  it('erzeugt ein PDF mit einer Seite pro Bild', async () => {
    const blob = buildPdf([TINY_JPEG, TINY_JPEG, TINY_JPEG])
    expect(blob.type).toBe('application/pdf')
    expect(await pdfPageCount(blob)).toBe(3)
  })

  it('leere Liste ergibt 0 Seiten oder wirft nicht', async () => {
    const blob = buildPdf([TINY_JPEG])
    expect(await pdfPageCount(blob)).toBe(1)
  })
})
```

- [ ] **Step 3: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- pdf`
Expected: FAIL (`buildPdf` nicht gefunden).

- [ ] **Step 4: `src/pdf.ts` implementieren**

```ts
import { jsPDF } from 'jspdf'

const A4 = { w: 595.28, h: 841.89 } // pt

/** Baut ein A4-PDF: jedes JPEG-DataURL wird bildfüllend (mit Rand) auf ein Blatt gelegt. */
export function buildPdf(images: string[]): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 20
  images.forEach((dataUrl, idx) => {
    if (idx > 0) doc.addPage()
    const maxW = A4.w - margin * 2
    const maxH = A4.h - margin * 2
    // Bildseitenverhältnis über jsPDF ermitteln
    const props = doc.getImageProperties(dataUrl)
    const ratio = props.width / props.height
    let w = maxW
    let h = w / ratio
    if (h > maxH) { h = maxH; w = h * ratio }
    const x = (A4.w - w) / 2
    const y = (A4.h - h) / 2
    doc.addImage(dataUrl, 'JPEG', x, y, w, h)
  })
  return doc.output('blob')
}

/** Testhilfe: zählt Seiten anhand der PDF-Struktur. */
export async function pdfPageCount(blob: Blob): Promise<number> {
  const text = await blob.text()
  const matches = text.match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 0
}
```

- [ ] **Step 5: Test laufen lassen (muss bestehen)**

Run: `npm test -- pdf`
Expected: PASS (2 Tests). Falls `pdfPageCount` in der jsPDF-Ausgabe abweicht (komprimierter Stream), stattdessen `doc.getNumberOfPages()` in `buildPdf` in ein Debug-Log geben und den Regex auf die reale Ausgabe anpassen — die Assertion bleibt „Anzahl Seiten == Anzahl Bilder".

- [ ] **Step 6: Commit**

```bash
git add src/pdf.ts test/pdf.test.ts test/fixtures.ts
git commit -m "feat: build multi-page A4 pdf from images"
```

---

### Task 5: OCR-Titelvorschlag (`ocr.ts`)

**Files:**
- Create: `src/ocr.ts`, `test/ocr.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `suggestTitle(text: string, date: Date): string` — reine Heuristik: erste „aussagekräftige" Zeile (getrimmt, Länge ≥ 4, nicht nur aus Datum/Zahlen/Generik-Wörtern) → als Dateiname bereinigt; sonst `Beleg-<YYYY-MM-DD>`.
  - `recognizeFirstPage(imageDataUrl: string): Promise<string>` — dünner Tesseract-Wrapper (`deu`), gibt rohen Text zurück (kein Unit-Test).

- [ ] **Step 1: Failing Test schreiben** — `test/ocr.test.ts`

```ts
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
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- ocr`
Expected: FAIL (`suggestTitle` nicht gefunden).

- [ ] **Step 3: `src/ocr.ts` implementieren**

```ts
const GENERIC = new Set(['rechnung', 'quittung', 'beleg', 'kassenbon', 'bon', 'invoice', 'receipt'])

function pad(n: number): string { return String(n).padStart(2, '0') }
export function dateStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function sanitize(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function suggestTitle(text: string, date: Date): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const cleaned = sanitize(line)
    if (cleaned.length < 4) continue
    if (GENERIC.has(cleaned.toLowerCase())) continue
    if (/^[\d.,\s€$-]+$/.test(cleaned)) continue // nur Zahlen/Beträge
    return cleaned
  }
  return `Beleg-${dateStamp(date)}`
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- ocr`
Expected: PASS (4 Tests).

- [ ] **Step 5: Tesseract-Wrapper ergänzen** (kein Unit-Test)

In `src/ocr.ts` anhängen:
```ts
import { createWorker } from 'tesseract.js'

let workerPromise: ReturnType<typeof createWorker> | null = null

/** Lazy: erstellt einen deutschen Tesseract-Worker (Modell wird gecacht). */
export async function recognizeFirstPage(imageDataUrl: string): Promise<string> {
  if (!workerPromise) workerPromise = createWorker('deu')
  const worker = await workerPromise
  const { data } = await worker.recognize(imageDataUrl)
  return data.text
}
```

- [ ] **Step 6: Commit**

```bash
git add src/ocr.ts test/ocr.test.ts
git commit -m "feat: add ocr title suggestion heuristic and tesseract wrapper"
```

---

### Task 6: Teilen (`share.ts`)

**Files:**
- Create: `src/share.ts`, `test/share.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `sharePdf(blob: Blob, filename: string, deps?: ShareDeps): Promise<'shared' | 'downloaded'>` — versucht `navigator.share({files})`; wenn nicht möglich, Download-Fallback. `deps` ist injizierbar für Tests: `{ nav?: {canShare?, share?}, download?: (blob, name) => void }`.

- [ ] **Step 1: Failing Test schreiben** — `test/share.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest'
import { sharePdf } from '../src/share'

const blob = new Blob(['%PDF'], { type: 'application/pdf' })

describe('sharePdf', () => {
  it('nutzt navigator.share, wenn canShare true ist', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const nav = { canShare: () => true, share }
    const result = await sharePdf(blob, 'Test.pdf', { nav })
    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
  })

  it('fällt auf Download zurück, wenn share fehlt', async () => {
    const download = vi.fn()
    const result = await sharePdf(blob, 'Test.pdf', { nav: {}, download })
    expect(result).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(blob, 'Test.pdf')
  })

  it('fällt auf Download zurück, wenn share wirft', async () => {
    const download = vi.fn()
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('x')) }
    const result = await sharePdf(blob, 'Test.pdf', { nav, download })
    expect(result).toBe('downloaded')
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- share`
Expected: FAIL (`sharePdf` nicht gefunden).

- [ ] **Step 3: `src/share.ts` implementieren**

```ts
interface ShareDeps {
  nav?: {
    canShare?: (data?: unknown) => boolean
    share?: (data: unknown) => Promise<void>
  }
  download?: (blob: Blob, filename: string) => void
}

function defaultDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function sharePdf(
  blob: Blob,
  filename: string,
  deps: ShareDeps = {},
): Promise<'shared' | 'downloaded'> {
  const nav = deps.nav ?? (typeof navigator !== 'undefined' ? (navigator as ShareDeps['nav']) : {})
  const download = deps.download ?? defaultDownload
  const file = new File([blob], filename, { type: 'application/pdf' })
  const data = { files: [file], title: filename }
  try {
    if (nav?.share && (!nav.canShare || nav.canShare(data))) {
      await nav.share(data)
      return 'shared'
    }
  } catch {
    // Nutzer-Abbruch oder nicht unterstützt → Fallback
  }
  download(blob, filename)
  return 'downloaded'
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- share`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/share.ts test/share.test.ts
git commit -m "feat: add web share with download fallback"
```

---

### Task 7: Kamera (`camera.ts`)

**Files:**
- Create: `src/camera.ts`, `test/camera.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `startCamera(video: HTMLVideoElement): Promise<MediaStream>` — Rückkamera (`facingMode: 'environment'`), bindet Stream an `video` (kein Unit-Test).
  - `stopCamera(stream: MediaStream): void` (kein Unit-Test).
  - `captureFrame(video: HTMLVideoElement): HTMLCanvasElement` — zeichnet aktuelles Videobild in ein neues Canvas (manuell/Browser).
  - `downscale(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement` — skaliert proportional herunter, falls die längere Kante `maxDim` übersteigt (Unit-getestet über eine reine Rechenfunktion `fitDimensions`).

- [ ] **Step 1: Failing Test schreiben** — `test/camera.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { fitDimensions } from '../src/camera'

describe('fitDimensions', () => {
  it('lässt kleine Bilder unverändert', () => {
    expect(fitDimensions(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
  it('skaliert die längere Kante auf maxDim', () => {
    expect(fitDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 })
  })
  it('funktioniert auch für Hochformat', () => {
    expect(fitDimensions(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 })
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- camera`
Expected: FAIL (`fitDimensions` nicht gefunden).

- [ ] **Step 3: `src/camera.ts` implementieren**

```ts
export function fitDimensions(w: number, h: number, maxDim: number): { width: number; height: number } {
  const longer = Math.max(w, h)
  if (longer <= maxDim) return { width: w, height: h }
  const scale = maxDim / longer
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1920 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(t => t.stop())
}

export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return canvas
}

export function downscale(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const { width, height } = fitDimensions(canvas.width, canvas.height, maxDim)
  if (width === canvas.width) return canvas
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  out.getContext('2d')!.drawImage(canvas, 0, 0, width, height)
  return out
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- camera`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/camera.ts test/camera.test.ts
git commit -m "feat: add camera capture and downscale helpers"
```

---

### Task 8: Erkennung + Entzerrung (`detect.ts`)

**Files:**
- Create: `src/detect.ts`, `test/detect.test.ts`

**Interfaces:**
- Consumes: `Point`, `Quad` aus `src/types.ts`; `HTMLCanvasElement`
- Produces:
  - `orderCorners(points: Point[]): Quad` — ordnet 4 unsortierte Punkte in topLeft/topRight/bottomRight/bottomLeft (reine Geometrie, Unit-getestet).
  - `fullFrameQuad(w: number, h: number): Quad` — Rechteck über das ganze Bild (Fallback).
  - `loadOpenCv(): Promise<void>` — lädt OpenCV.js lazy (kein Unit-Test).
  - `detectQuad(canvas: HTMLCanvasElement): Promise<Quad>` — jscanify-Erkennung; bei Fehler `fullFrameQuad` (Browser/manuell).
  - `warp(canvas: HTMLCanvasElement, quad: Quad): HTMLCanvasElement` — perspektivische Entzerrung auf Zielgröße (Browser/manuell).

- [ ] **Step 1: Failing Test schreiben** — `test/detect.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { orderCorners, fullFrameQuad } from '../src/detect'

describe('orderCorners', () => {
  it('ordnet gemischte Punkte korrekt zu', () => {
    const pts = [
      { x: 10, y: 300 }, // bottomLeft
      { x: 200, y: 8 },  // topRight
      { x: 8, y: 10 },   // topLeft
      { x: 210, y: 310 },// bottomRight
    ]
    const q = orderCorners(pts)
    expect(q.topLeft).toEqual({ x: 8, y: 10 })
    expect(q.topRight).toEqual({ x: 200, y: 8 })
    expect(q.bottomRight).toEqual({ x: 210, y: 310 })
    expect(q.bottomLeft).toEqual({ x: 10, y: 300 })
  })
})

describe('fullFrameQuad', () => {
  it('spannt das ganze Bild auf', () => {
    const q = fullFrameQuad(100, 50)
    expect(q.topLeft).toEqual({ x: 0, y: 0 })
    expect(q.bottomRight).toEqual({ x: 100, y: 50 })
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- detect`
Expected: FAIL (`orderCorners` nicht gefunden).

- [ ] **Step 3: Reine Geometrie in `src/detect.ts` implementieren**

```ts
import type { Point, Quad } from './types'

/** Ordnet 4 Punkte: topLeft = min(x+y), bottomRight = max(x+y), topRight = min(y-x), bottomLeft = max(y-x). */
export function orderCorners(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return {
    topLeft: bySum[0],
    bottomRight: bySum[bySum.length - 1],
    topRight: byDiff[0],
    bottomLeft: byDiff[byDiff.length - 1],
  }
}

export function fullFrameQuad(w: number, h: number): Quad {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: w, y: 0 },
    bottomRight: { x: w, y: h },
    bottomLeft: { x: 0, y: h },
  }
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- detect`
Expected: PASS (2 Tests).

- [ ] **Step 5: OpenCV/jscanify-Teil ergänzen** (kein Unit-Test — Browser/manuell)

In `src/detect.ts` anhängen. OpenCV.js wird über `<script>` nachgeladen und liegt global als `cv`; jscanify nutzt dieses `cv`.
```ts
import jscanify from 'jscanify'

declare global { interface Window { cv?: unknown } }

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

export function loadOpenCv(): Promise<void> {
  if (window.cv) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = OPENCV_URL
    s.async = true
    s.onload = () => {
      // OpenCV meldet Bereitschaft asynchron
      const cv = window.cv as { onRuntimeInitialized?: () => void; Mat?: unknown }
      if (cv?.Mat) resolve()
      else cv!.onRuntimeInitialized = () => resolve()
    }
    s.onerror = () => reject(new Error('OpenCV.js konnte nicht geladen werden'))
    document.head.appendChild(s)
  })
}

function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = canvas.toDataURL('image/png')
  })
}

export async function detectQuad(canvas: HTMLCanvasElement): Promise<Quad> {
  try {
    await loadOpenCv()
    const scanner = new (jscanify as unknown as { new (): any })()
    const img = await canvasToImage(canvas)
    const contour = scanner.findPaperContour(scanner.cv?.imread ? scanner.cv.imread(img) : img)
    const c = scanner.getCornerPoints(contour)
    const pts: Point[] = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner]
    if (pts.some(p => !p)) return fullFrameQuad(canvas.width, canvas.height)
    return orderCorners(pts)
  } catch {
    return fullFrameQuad(canvas.width, canvas.height)
  }
}

export function warp(canvas: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const scanner = new (jscanify as unknown as { new (): any })()
  const width = Math.round(
    Math.max(dist(quad.topLeft, quad.topRight), dist(quad.bottomLeft, quad.bottomRight)),
  )
  const height = Math.round(
    Math.max(dist(quad.topLeft, quad.bottomLeft), dist(quad.topRight, quad.bottomRight)),
  )
  const cornerPoints = {
    topLeftCorner: quad.topLeft,
    topRightCorner: quad.topRight,
    bottomRightCorner: quad.bottomRight,
    bottomLeftCorner: quad.bottomLeft,
  }
  return scanner.extractPaper(canvas, width, height, cornerPoints) as HTMLCanvasElement
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
```

Hinweis für den Implementierer: Die exakte jscanify-Signatur (`findPaperContour`/`extractPaper`) an der installierten Version verifizieren (README/`node_modules/jscanify`) und den Wrapper ggf. anpassen — Kern-Contract (`detectQuad`→`Quad`, `warp`→entzerrtes Canvas) bleibt. Manuell im Browser mit einem echten Beleg-Foto prüfen.

- [ ] **Step 6: Commit**

```bash
git add src/detect.ts test/detect.test.ts
git commit -m "feat: add corner detection geometry and jscanify warp wrapper"
```

---

### Task 9: Zuschneide-Editor (`cropEditor.ts`)

**Files:**
- Create: `src/cropEditor.ts`, `test/cropEditor.test.ts`

**Interfaces:**
- Consumes: `Point`, `Quad`
- Produces:
  - `clientToImage(clientX, clientY, rect: {left,top,width,height}, imageW, imageH): Point` — rechnet Touch-/Maus-Koordinaten in Bildkoordinaten um und clippt auf [0,imageW]×[0,imageH] (Unit-getestet).
  - `mountCropEditor(container, canvas, initial: Quad, onChange?): { getQuad(): Quad; destroy(): void }` — zeigt Bild + 4 ziehbare Ecken (Browser/manuell).

- [ ] **Step 1: Failing Test schreiben** — `test/cropEditor.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { clientToImage } from '../src/cropEditor'

const rect = { left: 100, top: 50, width: 200, height: 400 }

describe('clientToImage', () => {
  it('rechnet Anzeige- in Bildkoordinaten um', () => {
    // Klick in der Mitte der Anzeige → Mitte des Bildes
    const p = clientToImage(200, 250, rect, 1000, 2000)
    expect(p).toEqual({ x: 500, y: 1000 })
  })
  it('clippt außerhalb liegende Punkte an den Bildrand', () => {
    const p = clientToImage(50, 10, rect, 1000, 2000)
    expect(p).toEqual({ x: 0, y: 0 })
  })
})
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- cropEditor`
Expected: FAIL (`clientToImage` nicht gefunden).

- [ ] **Step 3: Reine Umrechnung implementieren** — `src/cropEditor.ts`

```ts
import type { Point, Quad } from './types'

export function clientToImage(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  imageW: number,
  imageH: number,
): Point {
  const nx = (clientX - rect.left) / rect.width
  const ny = (clientY - rect.top) / rect.height
  const x = Math.min(imageW, Math.max(0, Math.round(nx * imageW)))
  const y = Math.min(imageH, Math.max(0, Math.round(ny * imageH)))
  return { x, y }
}
```

- [ ] **Step 4: Test laufen lassen (muss bestehen)**

Run: `npm test -- cropEditor`
Expected: PASS (2 Tests).

- [ ] **Step 5: DOM-Editor ergänzen** (kein Unit-Test — Browser/manuell)

In `src/cropEditor.ts` anhängen:
```ts
const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const

export function mountCropEditor(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  initial: Quad,
  onChange?: (q: Quad) => void,
): { getQuad(): Quad; destroy(): void } {
  const quad: Quad = JSON.parse(JSON.stringify(initial))
  container.innerHTML = ''
  container.style.position = 'relative'
  canvas.style.width = '100%'
  canvas.style.display = 'block'
  container.appendChild(canvas)

  const handles = CORNER_KEYS.map(key => {
    const el = document.createElement('div')
    el.className = 'corner-handle'
    el.dataset.key = key
    container.appendChild(el)
    return { key, el }
  })

  function place() {
    const rect = canvas.getBoundingClientRect()
    for (const { key, el } of handles) {
      const p = quad[key]
      el.style.left = `${(p.x / canvas.width) * rect.width}px`
      el.style.top = `${(p.y / canvas.height) * rect.height}px`
    }
  }

  let active: typeof CORNER_KEYS[number] | null = null
  function onDown(e: PointerEvent) {
    const key = (e.target as HTMLElement).dataset?.key as typeof active
    if (key) { active = key; e.preventDefault() }
  }
  function onMove(e: PointerEvent) {
    if (!active) return
    const rect = canvas.getBoundingClientRect()
    quad[active] = clientToImage(e.clientX, e.clientY, rect, canvas.width, canvas.height)
    place()
    onChange?.(quad)
  }
  function onUp() { active = null }

  container.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('resize', place)
  place()

  return {
    getQuad: () => JSON.parse(JSON.stringify(quad)),
    destroy() {
      container.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', place)
    },
  }
}
```

Ergänze in `src/styles.css`:
```css
.corner-handle {
  position: absolute; width: 28px; height: 28px; margin: -14px 0 0 -14px;
  border: 3px solid #0a84ff; border-radius: 50%; background: rgba(10,132,255,.25);
  touch-action: none;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/cropEditor.ts test/cropEditor.test.ts src/styles.css
git commit -m "feat: add crop editor with draggable corners"
```

---

### Task 10: App-Flow verdrahten (`app.ts`)

**Files:**
- Create: `src/app.ts`
- Modify: `src/main.ts`, `src/styles.css`

**Interfaces:**
- Consumes: alle vorherigen Module (`startCamera`/`captureFrame`/`downscale`, `detectQuad`/`warp`, `mountCropEditor`, `enhanceCanvas`, `PageStore`, `recognizeFirstPage`/`suggestTitle`, `buildPdf`, `sharePdf`).
- Produces: `startApp(root: HTMLElement): void` — steuert die vier Screens.

- [ ] **Step 1: `src/app.ts` implementieren** (kein Unit-Test — Integrations-/Geräte-Test)

```ts
import { startCamera, stopCamera, captureFrame, downscale } from './camera'
import { detectQuad, warp } from './detect'
import { mountCropEditor } from './cropEditor'
import { enhanceCanvas } from './enhance'
import { PageStore } from './pages'
import { recognizeFirstPage, suggestTitle, dateStamp } from './ocr'
import { buildPdf } from './pdf'
import { sharePdf } from './share'
import type { Quad } from './types'

const MAX_DIM = 2000
const store = new PageStore()

export function startApp(root: HTMLElement): void {
  showCapture(root)
}

function screen(root: HTMLElement, title: string): HTMLDivElement {
  root.innerHTML = `<header class="bar">${title}</header><main class="screen"></main>`
  return root.querySelector('main')!
}

async function showCapture(root: HTMLElement) {
  const main = screen(root, 'Aufnahme')
  const video = document.createElement('video')
  video.playsInline = true
  main.appendChild(video)
  const shot = button('Foto aufnehmen', 'primary')
  main.appendChild(shot)
  if (store.count() > 0) {
    const done = button(`Fertig (${store.count()} Seiten)`, 'secondary')
    done.onclick = () => showFinish(root)
    main.appendChild(done)
  }
  let stream: MediaStream
  try {
    stream = await startCamera(video)
  } catch {
    main.appendChild(note('Kamerazugriff verweigert. In den Safari-Einstellungen für diese Seite die Kamera erlauben.'))
    return
  }
  shot.onclick = async () => {
    const full = downscale(captureFrame(video), MAX_DIM)
    stopCamera(stream)
    const quad = await detectQuad(full)
    showCrop(root, full, quad)
  }
}

function showCrop(root: HTMLElement, canvas: HTMLCanvasElement, quad: Quad) {
  const main = screen(root, 'Zuschneiden')
  const holder = document.createElement('div')
  main.appendChild(holder)
  const editor = mountCropEditor(holder, canvas, quad)
  const retake = button('Neu aufnehmen', 'secondary')
  retake.onclick = () => showCapture(root)
  const ok = button('Übernehmen', 'primary')
  ok.onclick = () => {
    const warped = warp(canvas, editor.getQuad())
    enhanceCanvas(warped)
    warped.toBlob(blob => {
      const url = warped.toDataURL('image/jpeg', 0.85)
      store.add({ image: blob!, width: warped.width, height: warped.height, thumbnailUrl: url })
      showCapture(root)
    }, 'image/jpeg', 0.85)
  }
  main.append(retake, ok)
}

async function showFinish(root: HTMLElement) {
  const main = screen(root, 'Name & Teilen')
  main.appendChild(note('Text wird erkannt …'))
  const first = store.list()[0]
  let title = `Beleg-${dateStamp(new Date())}`
  try {
    const text = await recognizeFirstPage(first.thumbnailUrl)
    title = suggestTitle(text, new Date())
  } catch { /* Default behalten */ }
  main.innerHTML = ''
  const input = document.createElement('input')
  input.type = 'text'
  input.value = title
  input.className = 'name-input'
  const share = button('PDF teilen', 'primary')
  share.onclick = async () => {
    const images = store.list().map(p => p.thumbnailUrl)
    const blob = buildPdf(images)
    await sharePdf(blob, `${input.value.trim() || title}.pdf`)
  }
  const back = button('Zurück', 'secondary')
  back.onclick = () => showCapture(root)
  main.append(input, share, back)
}

function button(label: string, kind: 'primary' | 'secondary'): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.className = `btn ${kind}`
  return b
}
function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = 'note'
  p.textContent = text
  return p
}
```

- [ ] **Step 2: `src/main.ts` umstellen**

```ts
import './styles.css'
import { startApp } from './app'

startApp(document.querySelector<HTMLDivElement>('#app')!)
```

- [ ] **Step 3: Styles ergänzen** — in `src/styles.css` anhängen

```css
.bar { padding: 12px 16px; font-weight: 600; background: #f2f2f7; }
.screen { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.screen video, .screen canvas { width: 100%; border-radius: 8px; background: #000; }
.btn { padding: 14px; border: 0; border-radius: 10px; font-size: 16px; }
.btn.primary { background: #0a84ff; color: #fff; }
.btn.secondary { background: #e5e5ea; color: #000; }
.name-input { padding: 14px; font-size: 16px; border: 1px solid #c7c7cc; border-radius: 10px; }
.note { color: #636366; }
```

- [ ] **Step 4: Build prüfen**

Run: `npm run build`
Expected: `tsc` ohne Fehler, `vite build` erzeugt `dist/`.

- [ ] **Step 5: Alle Tests laufen lassen**

Run: `npm test`
Expected: alle Unit-Tests (pages/enhance/pdf/ocr/share/camera/detect/cropEditor + smoke) grün.

- [ ] **Step 6: Commit**

```bash
git add src/app.ts src/main.ts src/styles.css
git commit -m "feat: wire capture-crop-pages-share flow"
```

---

### Task 11: PWA (installierbar + Asset-Caching)

**Files:**
- Modify: `vite.config.ts`
- Create: `public/icon-192.png`, `public/icon-512.png` (einfache Platzhalter-Icons)

**Interfaces:**
- Consumes: bestehende App
- Produces: installierbare PWA mit Service-Worker, der App-Shell sowie OpenCV.js und das Tesseract-Modell (Runtime-Caching) vorhält.

- [ ] **Step 1: `vite.config.ts` um PWA erweitern**

```ts
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/beleg-scanner/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Beleg-Scanner',
        short_name: 'Belege',
        start_url: '/beleg-scanner/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0a84ff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.href.includes('opencv.js') || url.href.includes('tesseract') || url.href.includes('tessdata'),
            handler: 'CacheFirst',
            options: { cacheName: 'heavy-assets', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
  test: { environment: 'jsdom', globals: true },
})
```

- [ ] **Step 2: Platzhalter-Icons erzeugen**

Run:
```bash
mkdir -p public
# 192er und 512er einfarbiges PNG erzeugen (nur Platzhalter, später ersetzbar)
node -e "const fs=require('fs');const png=(s)=>{const {createCanvas}=(()=>{try{return require('canvas')}catch{return null}})()||{};};" 2>/dev/null || true
```
Falls `canvas` nicht verfügbar: zwei beliebige quadratische PNGs (192×192, 512×512) als `public/icon-192.png` / `public/icon-512.png` ablegen (z.B. per Screenshot-Crop oder einem Online-Icon). Icons sind austauschbar; sie blockieren nur `npm run build` wenn referenziert und fehlend.

- [ ] **Step 3: Build prüfen**

Run: `npm run build`
Expected: `dist/` enthält `sw.js`/`manifest.webmanifest`, keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts public/icon-192.png public/icon-512.png
git commit -m "feat: add pwa manifest and service-worker asset caching"
```

---

### Task 12: Deploy auf GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: gebautes `dist/`
- Produces: automatischer Pages-Deploy bei Push auf `main`.

- [ ] **Step 1: Workflow anlegen** — `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README schreiben** — `README.md`

```markdown
# Beleg-Scanner

Web-App (PWA) für iOS: Beleg fotografieren → zuschneiden/entzerren → mehrseitiges PDF → per Share teilen.

## Entwicklung
- `npm install`
- `npm run dev` (für Kamera lokal HTTPS nötig, z.B. `vite --https` oder Tunnel)
- `npm test`

## Deploy
Push auf `main` → GitHub Actions baut und deployt auf GitHub Pages.
URL: https://nodogz902-collab.github.io/beleg-scanner/
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "chore: add github pages deploy workflow and readme"
```

- [ ] **Step 4: Remote anlegen und pushen (privater Account)**

Auf `nodogz902-collab` ein Repo `beleg-scanner` anlegen (per `gh` mit passendem Account oder Web-UI), dann:
```bash
git branch -M main
git remote add origin git@github.com:nodogz902-collab/beleg-scanner.git
git push -u origin main
```
Danach in den Repo-Settings **Pages → Source: GitHub Actions** aktivieren.

- [ ] **Step 5: Auf echtem iPhone testen**

Link öffnen (Safari), zur Startseite hinzufügen, kompletten Flow durchspielen: Kamera-Erlaubnis → Foto → Ecken korrigieren → mehrere Seiten → OCR-Name → „PDF teilen" → Mail.

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:** Kamera (T7), halb-auto Erkennung + ziehbare Ecken (T8/T9), Entzerrung + Aufhellung (T8/T3), mehrseitig (T2/T10), OCR-Name (T5), PDF (T4), Web Share + Fallback (T6), GitHub Pages/PWA (T11/T12), Fehlerbehandlung (Kamera-Permission T10, Erkennungs-Fallback T8, Share-Fallback T6, Downscale T7). Alle Spec-Punkte haben eine Task.

**Platzhalter:** Keine „TBD/TODO" in Code-Schritten. Icon-Erzeugung (T11 Step 2) ist bewusst offen gelassen (echte Assets, kein Code) mit klarer Handlungsanweisung.

**Typ-Konsistenz:** `Quad`/`Point`/`Page` einheitlich aus `types.ts`; `detectQuad`→`Quad`, `warp(canvas,quad)`→Canvas, `buildPdf(string[])`→Blob, `sharePdf(blob,name)` konsistent zwischen Definition (T4/T6/T8) und Nutzung (T10).
