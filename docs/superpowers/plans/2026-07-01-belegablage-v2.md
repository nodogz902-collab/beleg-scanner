# Beleg-Scanner v2 „Belegablage" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das v1-Scanner-PWA zu einem persistenten Beleg-Ablage-Tool ausbauen: Live-Auto-Erfassung, OCR-vorbefüllte Metadaten, automatische Jahr/Monat+Tags-Ablage, durchsuchbares IndexedDB-Archiv, ZIP-Backup, ruhig-professionelles Design (Light/Dark).

**Architecture:** Preact + @preact/signals als reaktive UI-Schicht über den bestehenden, getesteten Pipeline-Modulen (`detect`, `enhance`, `pdf`, `ocr`, `share`, `camera`, `cropEditor`). Persistenz über IndexedDB (`idb`). Ableitbare „Ordner" (Jahr→Monat) statt separater Entitäten. Reine Logik (Store-Abfragen, Feld-Extraktion, ZIP-Round-Trip, Stabilitäts-Heuristik) ist headless testbar; Kamera/Live-Detektion/echtes OpenCV bleiben manueller Gerätetest.

**Tech Stack:** Vite, TypeScript, Preact, @preact/signals, @preact/preset-vite, idb, fflate (ZIP), Tesseract.js, jsPDF, jscanify/OpenCV.js, vite-plugin-pwa, Vitest, @testing-library/preact, fake-indexeddb.

## Global Constraints

- Ziel-Plattform **iOS Safari 15+**, App läuft unter **HTTPS**; Node 22, npm.
- Vite `base` bleibt `/beleg-scanner/`; vitest-Block (`environment: 'jsdom', globals: true`) bleibt erhalten.
- OpenCV.js-URL ist **`https://docs.opencv.org/4.9.0/opencv.js`** (4.10+/4.11 existieren dort nicht → 404). Nicht ändern.
- tsconfig behält **`noEmit: true`** (sonst emittiert `tsc` stray `.js`, Vitest zählt doppelt).
- Beträge werden intern als **ganzzahlige Cent** gespeichert (`number | null`).
- Belegdatum-Format **`YYYY-MM-DD`**; `jahr`/`monat` werden daraus abgeleitet.
- Design: ruhig & professionell, **Akzent tiefes Petrol** (`#0f766e`-Familie), Light primär + Dark optional via `data-theme` + `prefers-color-scheme`; Touch-Ziele ≥ 44px.
- **Kein Backend, keine Cloud** — Persistenz lokal (IndexedDB) + ZIP-Backup.
- Conventional Commits (`feat:`/`test:`/`chore:`/`fix:`/`docs:`), **keine AI-Attribution** in Commits.
- Nach jeder Task: `npm test` grün UND `npm run build` sauber. Testanzahl darf nur um die neuen Tests steigen; bei stray `.js`/doppelten Zählungen `find src test -name '*.js' -delete`.

---

### Task 1: Preact + Tooling-Setup

**Files:**
- Modify: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
- Create: `src/main.tsx`, `src/app.tsx`, `test/app.smoke.test.tsx`
- Delete: `src/main.ts` (ersetzt durch `main.tsx`)

**Interfaces:**
- Consumes: nichts
- Produces: bootbare Preact-App; `App` (Default-Export aus `src/app.tsx`) rendert vorerst einen Platzhalter.

- [ ] **Step 1: Dependencies installieren**

Run:
```bash
cd /home/alex/beleg-scanner
npm i preact @preact/signals idb fflate
npm i -D @preact/preset-vite @testing-library/preact fake-indexeddb
```

- [ ] **Step 2: `tsconfig.json` um JSX erweitern** (füge in `compilerOptions` hinzu, Rest unverändert lassen)

```jsonc
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
```

- [ ] **Step 3: `vite.config.ts` — Preact-Plugin ergänzen** (VitePWA + base + test-Block behalten, `preact()` VOR VitePWA in `plugins` einfügen)

```ts
import preact from '@preact/preset-vite'
// ...
  plugins: [
    preact(),
    VitePWA({ /* unverändert */ }),
  ],
```
Ergänze im `test`-Block: `` environment: 'jsdom', globals: true, setupFiles: ['./test/setup.ts'] `` und erstelle `test/setup.ts` mit:
```ts
import 'fake-indexeddb/auto'
```

- [ ] **Step 4: `index.html` Script auf `main.tsx` zeigen**

Ändere `<script type="module" src="/src/main.ts">` → `src="/src/main.tsx"`.

- [ ] **Step 5: `src/main.tsx` + `src/app.tsx` erstellen, `src/main.ts` löschen**

`src/main.tsx`:
```tsx
import { render } from 'preact'
import './styles/global.css'
import { App } from './app'

render(<App />, document.querySelector('#app')!)
```
`src/app.tsx`:
```tsx
export function App() {
  return <div class="app-root">Belegablage</div>
}
```
Lösche `src/main.ts` und die alte `src/app.ts` (der v1-Flow wird ersetzt).
Erstelle vorerst leere `src/styles/global.css` (Task 2 füllt sie).

- [ ] **Step 6: Smoke-Test** — `test/app.smoke.test.tsx`

```tsx
import { render, screen } from '@testing-library/preact'
import { describe, it, expect } from 'vitest'
import { App } from '../src/app'

describe('App', () => {
  it('rendert die App-Wurzel', () => {
    render(<App />)
    expect(screen.getByText('Belegablage')).toBeTruthy()
  })
})
```

- [ ] **Step 7: Alte v1-Tests/-Dateien bereinigen**

Die v1-`app.ts` hatte keinen eigenen Test. Lösche NICHT die getesteten Pipeline-Module (`detect/enhance/pdf/ocr/share/camera/cropEditor/pages`) und ihre Tests — sie bleiben. Falls `test/smoke.test.ts` (v1) existiert, kann es bleiben.

- [ ] **Step 8: Verifizieren**

Run: `cd /home/alex/beleg-scanner && npm test && npm run build`
Expected: alle Tests grün (inkl. neuer App-Smoke), `tsc`+`vite build` ohne Fehler, keine stray `.js`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: add preact + signals + idb + fflate, boot preact app"
```

---

### Task 2: Design-Tokens + Basis-Styles + Primitive

**Files:**
- Create: `src/styles/tokens.css`, `src/ui/components/Button.tsx`, `src/ui/components/Field.tsx`, `src/ui/components/Chip.tsx`, `src/ui/components/Card.tsx`
- Modify: `src/styles/global.css`, `src/app.tsx`
- Test: `test/components.test.tsx`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `Button(props: { variant?: 'primary'|'secondary'|'ghost'|'danger'; onClick?: () => void; disabled?: boolean; type?: 'button'|'submit'; children })`
  - `Field(props: { label: string; children })` (Label + Slot)
  - `Chip(props: { label: string; onRemove?: () => void })`
  - `Card(props: { onClick?: () => void; children })`

- [ ] **Step 1: `src/styles/tokens.css`** (ruhig-professionell, Petrol-Akzent, Light+Dark)

```css
:root {
  --accent: #0f766e; --accent-hover: #115e59; --accent-fg: #ffffff;
  --bg: #f7f8f8; --surface: #ffffff; --surface-2: #f1f3f3;
  --text: #16201f; --text-muted: #5b6a68; --border: #dfe4e3;
  --success: #178a50; --warning: #b7791f; --danger: #c0392b;
  --radius: 12px; --radius-sm: 8px; --shadow: 0 1px 2px rgba(16,32,31,.06), 0 4px 12px rgba(16,32,31,.06);
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
  --font: -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
  --fs-sm: 13px; --fs-md: 15px; --fs-lg: 18px; --fs-xl: 24px;
}
[data-theme="dark"] {
  --bg: #0e1413; --surface: #16201f; --surface-2: #1d2a28;
  --text: #eaf0ef; --text-muted: #9fb0ad; --border: #2a3a37;
  --accent: #2dd4bf; --accent-hover: #5eead4; --accent-fg: #04211d;
  --shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.4);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0e1413; --surface: #16201f; --surface-2: #1d2a28;
    --text: #eaf0ef; --text-muted: #9fb0ad; --border: #2a3a37;
    --accent: #2dd4bf; --accent-hover: #5eead4; --accent-fg: #04211d;
    --shadow: 0 1px 2px rgba(0,0,0,.4), 0 4px 14px rgba(0,0,0,.4);
  }
}
```

- [ ] **Step 2: `src/styles/global.css`**

```css
@import './tokens.css';
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body { font-family: var(--font); font-size: var(--fs-md); color: var(--text); background: var(--bg); -webkit-text-size-adjust: 100%; }
#app { min-height: 100%; }
button { font: inherit; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--sp-2); min-height: 44px; padding: 0 var(--sp-4); border: 1px solid transparent; border-radius: var(--radius-sm); font-size: var(--fs-md); font-weight: 600; cursor: pointer; }
.btn-primary { background: var(--accent); color: var(--accent-fg); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-secondary { background: var(--surface-2); color: var(--text); border-color: var(--border); }
.btn-ghost { background: transparent; color: var(--text); }
.btn-danger { background: var(--danger); color: #fff; }
.btn:disabled { opacity: .5; cursor: default; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow); padding: var(--sp-4); }
.field { display: flex; flex-direction: column; gap: var(--sp-1); margin-bottom: var(--sp-3); }
.field label { font-size: var(--fs-sm); color: var(--text-muted); }
.field input, .field select, .field textarea { min-height: 44px; padding: 0 var(--sp-3); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: var(--fs-md); }
.chip { display: inline-flex; align-items: center; gap: var(--sp-1); padding: 4px var(--sp-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; font-size: var(--fs-sm); }
.chip button { border: 0; background: none; cursor: pointer; color: var(--text-muted); }
```

- [ ] **Step 3: Primitive-Komponenten** (real, funktionsfähig)

`src/ui/components/Button.tsx`:
```tsx
import type { ComponentChildren } from 'preact'
export function Button(
  { variant = 'primary', onClick, disabled, type = 'button', children }:
  { variant?: 'primary'|'secondary'|'ghost'|'danger'; onClick?: () => void; disabled?: boolean; type?: 'button'|'submit'; children: ComponentChildren },
) {
  return <button type={type} class={`btn btn-${variant}`} disabled={disabled} onClick={onClick}>{children}</button>
}
```
`src/ui/components/Field.tsx`:
```tsx
import type { ComponentChildren } from 'preact'
export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return <label class="field"><span>{label}</span>{children}</label>
}
```
`src/ui/components/Chip.tsx`:
```tsx
export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return <span class="chip">{label}{onRemove && <button aria-label={`${label} entfernen`} onClick={onRemove}>×</button>}</span>
}
```
`src/ui/components/Card.tsx`:
```tsx
import type { ComponentChildren } from 'preact'
export function Card({ onClick, children }: { onClick?: () => void; children: ComponentChildren }) {
  return <div class="card" onClick={onClick} style={onClick ? 'cursor:pointer' : undefined}>{children}</div>
}
```

- [ ] **Step 4: `src/app.tsx` Platzhalter stylen** (nur damit etwas Sichtbares da ist)

```tsx
import { Button } from './ui/components/Button'
export function App() {
  return <div class="app-root" style="padding:var(--sp-6)"><h1>Belegablage</h1><Button>Los geht's</Button></div>
}
```

- [ ] **Step 5: Komponenten-Test** — `test/components.test.tsx`

```tsx
import { render, screen } from '@testing-library/preact'
import { describe, it, expect, vi } from 'vitest'
import { Button } from '../src/ui/components/Button'
import { Chip } from '../src/ui/components/Chip'

describe('primitives', () => {
  it('Button ruft onClick', () => {
    const fn = vi.fn(); render(<Button onClick={fn}>Klick</Button>)
    screen.getByText('Klick').click(); expect(fn).toHaveBeenCalledOnce()
  })
  it('Chip zeigt Entfernen nur mit onRemove', () => {
    const fn = vi.fn(); render(<Chip label="Tag" onRemove={fn} />)
    screen.getByLabelText('Tag entfernen').click(); expect(fn).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 6: Verifizieren + Commit**

Run: `npm test && npm run build`
Expected: grün, Build ok.
```bash
git add -A
git commit -m "feat: add design tokens, base styles and ui primitives"
```

Hinweis: Die finale visuelle Politur (Feinschliff Typo/Farbwerte/Komponenten-Look) übernimmt bei der Umsetzung das frontend-design-Skill; diese Task setzt die Token-Struktur + funktionierende Primitive.

---

### Task 3: Datenmodell (`Receipt`) + Helfer

**Files:**
- Modify: `src/types.ts`
- Create: `src/model/receipt.ts`, `test/receipt.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - In `src/types.ts`: `interface Receipt { id: string; createdAt: number; belegdatum: string; jahr: number; monat: number; betrag: number | null; lieferant: string; kategorie: string; tags: string[]; notiz: string; pageBlobs: Blob[]; pdfBlob: Blob; thumbnailDataUrl: string; ocrText: string }`
  - `src/model/receipt.ts`: `deriveYearMonth(belegdatum: string): { jahr: number; monat: number }`, `formatEuro(cents: number | null): string`, `parseEuroToCents(input: string): number | null`, `monthKey(jahr: number, monat: number): string` (`'YYYY-MM'`).

- [ ] **Step 1: Failing Test** — `test/receipt.test.ts`

```ts
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
```

- [ ] **Step 2: Test läuft → FAIL**

Run: `npm test -- receipt` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: `src/types.ts` erweitern** (Point/Quad behalten, Receipt hinzufügen)

```ts
export interface Receipt {
  id: string
  createdAt: number
  belegdatum: string
  jahr: number
  monat: number
  betrag: number | null
  lieferant: string
  kategorie: string
  tags: string[]
  notiz: string
  pageBlobs: Blob[]
  pdfBlob: Blob
  thumbnailDataUrl: string
  ocrText: string
}
```

- [ ] **Step 4: `src/model/receipt.ts`**

```ts
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
```

- [ ] **Step 5: Test → PASS**

Run: `npm test -- receipt` — Expected: PASS (4).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/model/receipt.ts test/receipt.test.ts
git commit -m "feat: add receipt model and money/date helpers"
```

---

### Task 4: IndexedDB-Setup (`db/database.ts`)

**Files:**
- Create: `src/db/database.ts`, `test/database.test.ts`

**Interfaces:**
- Consumes: `Receipt`
- Produces: `getDb(): Promise<IDBPDatabase<BelegDB>>` mit Store `receipts` (keyPath `id`) und Indexen `by-monthKey` (`['jahr','monat']`), `by-lieferant`, `by-kategorie`, `by-belegdatum`. Typ `BelegDB` (DBSchema).

- [ ] **Step 1: Failing Test** — `test/database.test.ts` (fake-indexeddb via setup)

```ts
import { describe, it, expect } from 'vitest'
import { getDb } from '../src/db/database'

describe('database', () => {
  it('öffnet DB mit receipts-Store und Indexen', async () => {
    const db = await getDb()
    expect(db.objectStoreNames.contains('receipts')).toBe(true)
    const tx = db.transaction('receipts')
    const idx = Array.from(tx.store.indexNames)
    expect(idx).toContain('by-monthKey')
    expect(idx).toContain('by-lieferant')
  })
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- database`

- [ ] **Step 3: `src/db/database.ts`**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Receipt } from '../types'

export interface BelegDB extends DBSchema {
  receipts: {
    key: string
    value: Receipt
    indexes: {
      'by-monthKey': [number, number]
      'by-lieferant': string
      'by-kategorie': string
      'by-belegdatum': string
    }
  }
}

let dbPromise: Promise<IDBPDatabase<BelegDB>> | null = null

export function getDb(): Promise<IDBPDatabase<BelegDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BelegDB>('belegablage', 1, {
      upgrade(db) {
        const store = db.createObjectStore('receipts', { keyPath: 'id' })
        store.createIndex('by-monthKey', ['jahr', 'monat'])
        store.createIndex('by-lieferant', 'lieferant')
        store.createIndex('by-kategorie', 'kategorie')
        store.createIndex('by-belegdatum', 'belegdatum')
      },
    })
  }
  return dbPromise
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- database`

- [ ] **Step 5: Commit**

```bash
git add src/db/database.ts test/database.test.ts
git commit -m "feat: add indexeddb setup with receipts store and indexes"
```

---

### Task 5: Beleg-Store (`db/receiptStore.ts`)

**Files:**
- Create: `src/db/receiptStore.ts`, `test/receiptStore.test.ts`

**Interfaces:**
- Consumes: `getDb`, `Receipt`, `deriveYearMonth`, `monthKey`
- Produces:
  - `saveReceipt(r: Receipt): Promise<void>`
  - `getReceipt(id): Promise<Receipt | undefined>`
  - `deleteReceipt(id): Promise<void>`
  - `allReceipts(): Promise<Receipt[]>` (nach belegdatum absteigend)
  - `listMonths(): Promise<{ jahr: number; monat: number; count: number; summe: number }[]>` (absteigend)
  - `queryReceipts(q: { jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }): Promise<Receipt[]>`

- [ ] **Step 1: Failing Test** — `test/receiptStore.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { saveReceipt, getReceipt, deleteReceipt, allReceipts, listMonths, queryReceipts } from '../src/db/receiptStore'
import { getDb } from '../src/db/database'
import type { Receipt } from '../src/types'

function mk(id: string, belegdatum: string, betrag: number | null, over: Partial<Receipt> = {}): Receipt {
  const [y, m] = belegdatum.split('-').map(Number)
  return { id, createdAt: 1, belegdatum, jahr: y, monat: m, betrag, lieferant: over.lieferant ?? 'ACME', kategorie: over.kategorie ?? 'Sonstiges', tags: over.tags ?? [], notiz: over.notiz ?? '', pageBlobs: [], pdfBlob: new Blob(['%PDF']), thumbnailDataUrl: 'data:x', ocrText: over.ocrText ?? '' }
}

beforeEach(async () => { const db = await getDb(); await db.clear('receipts') })

describe('receiptStore', () => {
  it('save/get/delete', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1290))
    expect((await getReceipt('a'))?.betrag).toBe(1290)
    await deleteReceipt('a')
    expect(await getReceipt('a')).toBeUndefined()
  })
  it('allReceipts absteigend nach belegdatum', async () => {
    await saveReceipt(mk('a', '2026-06-01', 100)); await saveReceipt(mk('b', '2026-07-01', 200))
    expect((await allReceipts()).map(r => r.id)).toEqual(['b', 'a'])
  })
  it('listMonths zählt und summiert', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1000)); await saveReceipt(mk('b', '2026-07-15', 500)); await saveReceipt(mk('c', '2026-06-01', 300))
    const months = await listMonths()
    expect(months[0]).toEqual({ jahr: 2026, monat: 7, count: 2, summe: 1500 })
    expect(months[1]).toEqual({ jahr: 2026, monat: 6, count: 1, summe: 300 })
  })
  it('queryReceipts filtert nach Monat, Lieferant, Tag, Text', async () => {
    await saveReceipt(mk('a', '2026-07-01', 1000, { lieferant: 'Rewe', tags: ['essen'], ocrText: 'Milch Brot' }))
    await saveReceipt(mk('b', '2026-07-02', 2000, { lieferant: 'OBI', tags: ['bau'], ocrText: 'Schrauben' }))
    expect((await queryReceipts({ jahr: 2026, monat: 7 })).length).toBe(2)
    expect((await queryReceipts({ lieferant: 'Rewe' })).map(r => r.id)).toEqual(['a'])
    expect((await queryReceipts({ tag: 'bau' })).map(r => r.id)).toEqual(['b'])
    expect((await queryReceipts({ text: 'schrauben' })).map(r => r.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- receiptStore`

- [ ] **Step 3: `src/db/receiptStore.ts`**

```ts
import { getDb } from './database'
import type { Receipt } from '../types'

export async function saveReceipt(r: Receipt): Promise<void> {
  const db = await getDb(); await db.put('receipts', r)
}
export async function getReceipt(id: string): Promise<Receipt | undefined> {
  const db = await getDb(); return db.get('receipts', id)
}
export async function deleteReceipt(id: string): Promise<void> {
  const db = await getDb(); await db.delete('receipts', id)
}
export async function allReceipts(): Promise<Receipt[]> {
  const db = await getDb(); const all = await db.getAll('receipts')
  return all.sort((a, b) => (a.belegdatum < b.belegdatum ? 1 : a.belegdatum > b.belegdatum ? -1 : 0))
}
export async function listMonths(): Promise<{ jahr: number; monat: number; count: number; summe: number }[]> {
  const all = await allReceipts()
  const map = new Map<string, { jahr: number; monat: number; count: number; summe: number }>()
  for (const r of all) {
    const key = `${r.jahr}-${r.monat}`
    const cur = map.get(key) ?? { jahr: r.jahr, monat: r.monat, count: 0, summe: 0 }
    cur.count++; cur.summe += r.betrag ?? 0; map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.jahr - a.jahr || b.monat - a.monat)
}
export async function queryReceipts(q: { jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }): Promise<Receipt[]> {
  let list = await allReceipts()
  if (q.jahr !== undefined) list = list.filter(r => r.jahr === q.jahr)
  if (q.monat !== undefined) list = list.filter(r => r.monat === q.monat)
  if (q.lieferant) list = list.filter(r => r.lieferant === q.lieferant)
  if (q.kategorie) list = list.filter(r => r.kategorie === q.kategorie)
  if (q.tag) list = list.filter(r => r.tags.includes(q.tag!))
  if (q.text) {
    const t = q.text.toLowerCase()
    list = list.filter(r => `${r.lieferant} ${r.notiz} ${r.ocrText} ${r.tags.join(' ')}`.toLowerCase().includes(t))
  }
  return list
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- receiptStore`

- [ ] **Step 5: Commit**

```bash
git add src/db/receiptStore.ts test/receiptStore.test.ts
git commit -m "feat: add receipt store with queries, months and totals"
```

---

### Task 6: OCR-Feld-Extraktion (`ocr/extractFields.ts`)

**Files:**
- Create: `src/ocr/extractFields.ts`, `test/extractFields.test.ts`

**Interfaces:**
- Consumes: `parseEuroToCents` (aus `model/receipt`), `suggestTitle` (aus `ocr`)
- Produces: `extractFields(text: string): { belegdatum: string | null; betrag: number | null; lieferant: string | null }` — deutsche Formate.

- [ ] **Step 1: Failing Test** — `test/extractFields.test.ts`

```ts
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
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- extractFields`

- [ ] **Step 3: `src/ocr/extractFields.ts`**

```ts
import { parseEuroToCents } from '../model/receipt'
import { suggestTitle } from '../ocr'

function extractDate(text: string): string | null {
  const m = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/)
  if (!m) return null
  let [, d, mo, y] = m
  if (y.length === 2) y = '20' + y
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function extractAmount(text: string): number | null {
  const lines = text.split('\n')
  const kw = /(summe|gesamt|total|betrag|zu zahlen)/i
  const amountRe = /(\d{1,3}(?:[.\s]\d{3})*|\d+)[,.]\d{2}/g
  // 1) Zeile mit Schlüsselwort bevorzugen
  for (const line of lines) {
    if (kw.test(line)) {
      const found = line.match(amountRe)
      if (found?.length) return parseEuroToCents(found[found.length - 1])
    }
  }
  // 2) sonst größter Betrag im Text
  const all = (text.match(amountRe) ?? []).map(parseEuroToCents).filter((n): n is number => n !== null)
  return all.length ? Math.max(...all) : null
}

export function extractFields(text: string): { belegdatum: string | null; betrag: number | null; lieferant: string | null } {
  if (!text.trim()) return { belegdatum: null, betrag: null, lieferant: null }
  const title = suggestTitle(text, new Date())
  const lieferant = title.startsWith('Beleg-') ? null : title
  return { belegdatum: extractDate(text), betrag: extractAmount(text), lieferant }
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- extractFields`
Falls die „größter Betrag"-Heuristik im Test wackelt: sicherstellen, dass `amountRe` `15,00` als 1500 liefert und `Math.max` greift. Assertion bleibt: Summe-Zeile gewinnt, sonst Maximum.

- [ ] **Step 5: Commit**

```bash
git add src/ocr/extractFields.ts test/extractFields.test.ts
git commit -m "feat: extract belegdatum, betrag and lieferant from ocr text"
```

---

### Task 7: ZIP-Backup (`backup/zipBackup.ts`)

**Files:**
- Create: `src/backup/zipBackup.ts`, `test/zipBackup.test.ts`

**Interfaces:**
- Consumes: `Receipt`, `allReceipts`, `saveReceipt`, `fflate`
- Produces:
  - `exportArchive(): Promise<Blob>` — ZIP mit `metadata.json` (Belege ohne Blobs) + `pdf/<id>.pdf` je Beleg.
  - `importArchive(zip: Blob, mode: 'merge' | 'replace'): Promise<number>` — schreibt Belege in den Store, gibt Anzahl importierter Belege zurück.
  - Rein-funktionale Helfer `serializeReceipts(receipts): { meta: object; files: Record<string, Uint8Array> }` und `deserialize(meta, files): Receipt[]` (unit-getestet, ohne DB).

- [ ] **Step 1: Failing Test** — `test/zipBackup.test.ts` (Round-Trip der reinen Serialisierung)

```ts
import { describe, it, expect } from 'vitest'
import { serializeReceipts, deserialize } from '../src/backup/zipBackup'
import type { Receipt } from '../src/types'

const r: Receipt = { id: 'a', createdAt: 1, belegdatum: '2026-07-01', jahr: 2026, monat: 7, betrag: 1290, lieferant: 'Rewe', kategorie: 'Essen', tags: ['x'], notiz: 'n', pageBlobs: [], pdfBlob: new Blob([new Uint8Array([1,2,3])]), thumbnailDataUrl: 'data:t', ocrText: 'o' }

describe('zipBackup serialisierung', () => {
  it('serialize → deserialize erhält Metadaten und PDF-Bytes', async () => {
    const { meta, files } = await serializeReceipts([r])
    const back = await deserialize(meta, files)
    expect(back).toHaveLength(1)
    expect(back[0].id).toBe('a'); expect(back[0].betrag).toBe(1290); expect(back[0].lieferant).toBe('Rewe')
    expect(new Uint8Array(await back[0].pdfBlob.arrayBuffer())).toEqual(new Uint8Array([1,2,3]))
  })
})
```
Hinweis: `Blob.arrayBuffer()` ist in jsdom nicht garantiert — falls es fehlt, in `deserialize` das PDF als `Blob` aus `Uint8Array` bauen und den Test die Bytes über die im `files`-Record gehaltenen `Uint8Array` prüfen lassen (die Assertion bleibt „PDF-Bytes erhalten"). Nutze im Zweifel die Bytes direkt: `expect(files['pdf/a.pdf']).toEqual(new Uint8Array([1,2,3]))`.

- [ ] **Step 2: FAIL** — Run: `npm test -- zipBackup`

- [ ] **Step 3: `src/backup/zipBackup.ts`**

```ts
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { Receipt } from '../types'
import { allReceipts, saveReceipt } from '../db/receiptStore'

type MetaReceipt = Omit<Receipt, 'pageBlobs' | 'pdfBlob' | 'thumbnailDataUrl'> & { thumbnailDataUrl: string }

async function blobToU8(b: Blob): Promise<Uint8Array> {
  const buf = await b.arrayBuffer(); return new Uint8Array(buf)
}

export async function serializeReceipts(receipts: Receipt[]): Promise<{ meta: { version: number; receipts: MetaReceipt[] }; files: Record<string, Uint8Array> }> {
  const files: Record<string, Uint8Array> = {}
  const metaReceipts: MetaReceipt[] = []
  for (const r of receipts) {
    files[`pdf/${r.id}.pdf`] = await blobToU8(r.pdfBlob)
    const { pageBlobs, pdfBlob, ...rest } = r
    metaReceipts.push(rest)
  }
  return { meta: { version: 1, receipts: metaReceipts }, files }
}

export async function deserialize(meta: { receipts: MetaReceipt[] }, files: Record<string, Uint8Array>): Promise<Receipt[]> {
  return meta.receipts.map(m => ({
    ...m,
    pageBlobs: [],
    pdfBlob: new Blob([files[`pdf/${m.id}.pdf`] ?? new Uint8Array()], { type: 'application/pdf' }),
  }))
}

export async function exportArchive(): Promise<Blob> {
  const receipts = await allReceipts()
  const { meta, files } = await serializeReceipts(receipts)
  const entries: Record<string, Uint8Array> = { 'metadata.json': strToU8(JSON.stringify(meta)), ...files }
  const zipped = zipSync(entries)
  return new Blob([zipped], { type: 'application/zip' })
}

export async function importArchive(zip: Blob, mode: 'merge' | 'replace'): Promise<number> {
  const bytes = new Uint8Array(await zip.arrayBuffer())
  const files = unzipSync(bytes)
  const meta = JSON.parse(strFromU8(files['metadata.json']))
  const fileRecord: Record<string, Uint8Array> = {}
  for (const name of Object.keys(files)) if (name.startsWith('pdf/')) fileRecord[name] = files[name]
  const receipts = await deserialize(meta, fileRecord)
  if (mode === 'replace') { const db = (await import('../db/database')).getDb; await (await db()).clear('receipts') }
  for (const r of receipts) {
    if (mode === 'merge') r.id = `${r.id}-imp-${r.createdAt}`
    await saveReceipt(r)
  }
  return receipts.length
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- zipBackup` (ggf. Assertion wie in Step-1-Hinweis auf `files[...]`-Bytes umstellen, falls jsdom `arrayBuffer` fehlt).

- [ ] **Step 5: Commit**

```bash
git add src/backup/zipBackup.ts test/zipBackup.test.ts
git commit -m "feat: add zip archive export/import backup"
```

---

### Task 8: Live-Detektion-Heuristik (`scan/liveDetect.ts`)

**Files:**
- Create: `src/scan/liveDetect.ts`, `test/liveDetect.test.ts`

**Interfaces:**
- Consumes: `Quad`, `Point`
- Produces:
  - `quadAreaRatio(quad: Quad, w: number, h: number): number` — Shoelace-Fläche / Bildfläche.
  - `isStableQuad(history: Quad[], maxJitterPx: number): boolean` — true, wenn alle Ecken über die History unter der Jitter-Schwelle liegen (History-Länge ≥ 3).
  - `startLiveDetect(video, canvasEl, opts): () => void` (Loop; kein Unit-Test) — ruft `opts.onQuad(quad)` je Tick und `opts.onStable(quad)` bei Stabilität+Mindestfläche; gibt Stop-Funktion zurück.

- [ ] **Step 1: Failing Test** — `test/liveDetect.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { quadAreaRatio, isStableQuad } from '../src/scan/liveDetect'
import type { Quad } from '../src/types'

const full = (w: number, h: number): Quad => ({ topLeft: {x:0,y:0}, topRight:{x:w,y:0}, bottomRight:{x:w,y:h}, bottomLeft:{x:0,y:h} })

describe('liveDetect heuristik', () => {
  it('quadAreaRatio: Vollbild = 1, halbe Breite = 0.5', () => {
    expect(quadAreaRatio(full(100,100), 100, 100)).toBeCloseTo(1, 5)
    const half: Quad = { topLeft:{x:0,y:0}, topRight:{x:50,y:0}, bottomRight:{x:50,y:100}, bottomLeft:{x:0,y:100} }
    expect(quadAreaRatio(half, 100, 100)).toBeCloseTo(0.5, 5)
  })
  it('isStableQuad true bei geringem Jitter', () => {
    const h = [full(100,100), full(100,100), full(100,100)]
    expect(isStableQuad(h, 5)).toBe(true)
  })
  it('isStableQuad false bei großem Jitter', () => {
    const moved: Quad = { topLeft:{x:20,y:20}, topRight:{x:100,y:0}, bottomRight:{x:100,y:100}, bottomLeft:{x:0,y:100} }
    expect(isStableQuad([full(100,100), full(100,100), moved], 5)).toBe(false)
  })
  it('isStableQuad false bei zu kurzer History', () => {
    expect(isStableQuad([full(100,100)], 5)).toBe(false)
  })
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- liveDetect`

- [ ] **Step 3: `src/scan/liveDetect.ts`** (Heuristik + Loop)

```ts
import type { Quad, Point } from '../types'
import { detectQuad } from '../detect'

const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const

export function quadAreaRatio(quad: Quad, w: number, h: number): number {
  const pts: Point[] = CORNERS.map(k => quad[k])
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2 / (w * h)
}

export function isStableQuad(history: Quad[], maxJitterPx: number): boolean {
  if (history.length < 3) return false
  const recent = history.slice(-3)
  for (const k of CORNERS) {
    const xs = recent.map(q => q[k].x), ys = recent.map(q => q[k].y)
    if (Math.max(...xs) - Math.min(...xs) > maxJitterPx) return false
    if (Math.max(...ys) - Math.min(...ys) > maxJitterPx) return false
  }
  return true
}

export function startLiveDetect(
  video: HTMLVideoElement,
  work: HTMLCanvasElement,
  opts: { minAreaRatio?: number; maxJitterPx?: number; intervalMs?: number; onQuad?: (q: Quad) => void; onStable: (q: Quad) => void },
): () => void {
  const minArea = opts.minAreaRatio ?? 0.25
  const jitter = opts.maxJitterPx ?? 12
  const interval = opts.intervalMs ?? 150
  let stopped = false
  let last = 0
  let history: Quad[] = []
  async function tick(ts: number) {
    if (stopped) return
    if (ts - last >= interval && video.videoWidth) {
      last = ts
      const scale = 640 / Math.max(video.videoWidth, video.videoHeight)
      work.width = Math.round(video.videoWidth * scale)
      work.height = Math.round(video.videoHeight * scale)
      work.getContext('2d')!.drawImage(video, 0, 0, work.width, work.height)
      const quad = await detectQuad(work)
      opts.onQuad?.(quad)
      history = [...history, quad].slice(-3)
      if (quadAreaRatio(quad, work.width, work.height) >= minArea && isStableQuad(history, jitter)) {
        opts.onStable(quad); stopped = true; return
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return () => { stopped = true }
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- liveDetect`

- [ ] **Step 5: Commit**

```bash
git add src/scan/liveDetect.ts test/liveDetect.test.ts
git commit -m "feat: add live detection loop with stability/area heuristic"
```

---

### Task 9: App-State (`state/appState.ts`)

**Files:**
- Create: `src/state/appState.ts`, `test/appState.test.ts`

**Interfaces:**
- Consumes: `Receipt`
- Produces (Signals + Aktionen):
  - `view` (`signal<'scan'|'edit'|'archive'|'detail'|'settings'>`), Start `'archive'`.
  - `draftPages` (`signal<HTMLCanvasElement[]>`), `selectedId` (`signal<string | null>`), `archiveQuery` (`signal<{ jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }>`), `theme` (`signal<'light'|'dark'|'system'>`).
  - `goto(v)`, `openDetail(id)`, `applyTheme()` (setzt `data-theme` bzw. entfernt es bei `system`).

- [ ] **Step 1: Failing Test** — `test/appState.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { view, selectedId, theme, goto, openDetail, applyTheme } from '../src/state/appState'

beforeEach(() => { goto('archive'); theme.value = 'system' })

describe('appState', () => {
  it('goto ändert view', () => { goto('scan'); expect(view.value).toBe('scan') })
  it('openDetail setzt id und view', () => { openDetail('x'); expect(selectedId.value).toBe('x'); expect(view.value).toBe('detail') })
  it('applyTheme setzt data-theme für dark, entfernt bei system', () => {
    theme.value = 'dark'; applyTheme(); expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    theme.value = 'system'; applyTheme(); expect(document.documentElement.getAttribute('data-theme')).toBe(null)
  })
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- appState`

- [ ] **Step 3: `src/state/appState.ts`**

```ts
import { signal } from '@preact/signals'

export type View = 'scan' | 'edit' | 'archive' | 'detail' | 'settings'
export const view = signal<View>('archive')
export const draftPages = signal<HTMLCanvasElement[]>([])
export const selectedId = signal<string | null>(null)
export const archiveQuery = signal<{ jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }>({})
export const theme = signal<'light' | 'dark' | 'system'>('system')

export function goto(v: View): void { view.value = v }
export function openDetail(id: string): void { selectedId.value = id; view.value = 'detail' }
export function applyTheme(): void {
  const el = document.documentElement
  if (theme.value === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme.value)
}
```

- [ ] **Step 4: PASS** — Run: `npm test -- appState`

- [ ] **Step 5: Commit**

```bash
git add src/state/appState.ts test/appState.test.ts
git commit -m "feat: add signal-based app state and navigation"
```

---

### Task 10: Scan-View (Live-Erfassung + Galerie-Import)

**Files:**
- Create: `src/ui/Scan.tsx`
- Test: (browser-only; kein Unit-Test — Verifikation via Build + manuell)

**Interfaces:**
- Consumes: `startCamera`/`stopCamera`/`captureFrame`/`downscale` (`camera`), `startLiveDetect` (`liveDetect`), `detectQuad`/`warp` (`detect`), `enhanceCanvas` (`enhance`), `draftPages`/`goto` (`appState`)
- Produces: `Scan()` — Preact-Komponente; füllt `draftPages` mit entzerrten Canvases und `goto('edit')`.

- [ ] **Step 1: `src/ui/Scan.tsx` implementieren** (real, funktionsfähig; kein Unit-Test)

```tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { startCamera, stopCamera, captureFrame, downscale } from '../camera'
import { startLiveDetect } from '../scan/liveDetect'
import { detectQuad, warp } from '../detect'
import { enhanceCanvas } from '../enhance'
import { draftPages, goto } from '../state/appState'
import { Button } from './components/Button'

const MAX_DIM = 2000

export function Scan() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const workRef = useRef<HTMLCanvasElement>(document.createElement('canvas'))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const stopLoopRef = useRef<(() => void) | null>(null)

  async function process(full: HTMLCanvasElement) {
    setBusy(true)
    const quad = await detectQuad(full)
    const warped = warp(full, quad)
    enhanceCanvas(warped)
    draftPages.value = [...draftPages.value, warped]
    cleanup()
    goto('edit')
  }
  function cleanup() {
    stopLoopRef.current?.(); stopLoopRef.current = null
    if (streamRef.current) { stopCamera(streamRef.current); streamRef.current = null }
  }
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const v = videoRef.current!
        const stream = await startCamera(v); streamRef.current = stream
        if (cancelled) { cleanup(); return }
        stopLoopRef.current = startLiveDetect(v, workRef.current, {
          onQuad: q => drawOverlay(q),
          onStable: async () => { const full = downscale(captureFrame(v), MAX_DIM); await process(full) },
        })
      } catch { setError('Kamerazugriff nicht möglich. Erlaube die Kamera in den Safari-Einstellungen oder nutze den Datei-Import.') }
    })()
    return () => { cancelled = true; cleanup() }
  }, [])

  function drawOverlay(q: { topLeft:any; topRight:any; bottomRight:any; bottomLeft:any }) {
    const v = videoRef.current, c = overlayRef.current; if (!v || !c) return
    c.width = v.clientWidth; c.height = v.clientHeight
    const sx = c.width / workRef.current.width, sy = c.height / workRef.current.height
    const ctx = c.getContext('2d')!; ctx.clearRect(0,0,c.width,c.height)
    ctx.strokeStyle = '#2dd4bf'; ctx.lineWidth = 3; ctx.beginPath()
    const pts = [q.topLeft,q.topRight,q.bottomRight,q.bottomLeft]
    pts.forEach((p,i)=>{ const x=p.x*sx,y=p.y*sy; i?ctx.lineTo(x,y):ctx.moveTo(x,y) }); ctx.closePath(); ctx.stroke()
  }

  async function manualShot() {
    const v = videoRef.current!; const full = downscale(captureFrame(v), MAX_DIM); await process(full)
  }
  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
    const img = new Image(); img.src = URL.createObjectURL(file)
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    c.getContext('2d')!.drawImage(img, 0, 0); URL.revokeObjectURL(img.src)
    await process(downscale(c, MAX_DIM))
  }

  return (
    <div class="scan">
      {error
        ? <div class="card"><p>{error}</p><label class="btn btn-secondary">Bild wählen<input type="file" accept="image/*" hidden onChange={onFile} /></label></div>
        : <div class="scan-cam" style="position:relative">
            <video ref={videoRef} playsInline muted style="width:100%;display:block;border-radius:var(--radius)" />
            <canvas ref={overlayRef} style="position:absolute;inset:0;pointer-events:none" />
          </div>}
      <div class="scan-actions" style="display:flex;gap:var(--sp-3);margin-top:var(--sp-4)">
        <Button onClick={manualShot} disabled={busy || !!error}>Auslösen</Button>
        <label class="btn btn-secondary">Datei<input type="file" accept="image/*" hidden onChange={onFile} /></label>
        <Button variant="ghost" onClick={() => { cleanup(); goto('archive') }}>Abbrechen</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verifizieren**

Run: `npm run build && npm test`
Expected: Build ok (Komponente kompiliert), bestehende Tests grün. (Live-Kamera manuell am iPhone.)

- [ ] **Step 3: Commit**

```bash
git add src/ui/Scan.tsx
git commit -m "feat: add live-capture scan view with gallery import fallback"
```

---

### Task 11: Beleg-bearbeiten-View (Crop + Metadaten + Speichern)

**Files:**
- Create: `src/ui/EditReceipt.tsx`
- Test: `test/saveDraft.test.ts` (die reine Speicher-Zusammenbau-Funktion)

**Interfaces:**
- Consumes: `mountCropEditor`/`detectQuad`/`warp` (crop/detect), `buildPdf` (`pdf`), `recognizeFirstPage` (`ocr`), `extractFields` (`ocr/extractFields`), `deriveYearMonth` (`model/receipt`), `saveReceipt` (`receiptStore`), `draftPages`/`goto` (`appState`)
- Produces:
  - `EditReceipt()` — Komponente.
  - `buildReceiptFromForm(input: { pages: HTMLCanvasElement[]; form: FormFields; now: number; id: string }): Receipt` (rein, testbar) mit `FormFields = { belegdatum: string; betrag: number | null; lieferant: string; kategorie: string; tags: string[]; notiz: string; ocrText: string }`.

- [ ] **Step 1: Failing Test** — `test/saveDraft.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { buildReceiptFromForm } from '../src/ui/EditReceipt'

describe('buildReceiptFromForm', () => {
  it('leitet jahr/monat ab und übernimmt Formularwerte', () => {
    const c = document.createElement('canvas'); c.width = 10; c.height = 10
    const r = buildReceiptFromForm({ pages: [c], id: 'id1', now: 5, form: { belegdatum: '2026-07-01', betrag: 1290, lieferant: 'Rewe', kategorie: 'Essen', tags: ['x'], notiz: 'n', ocrText: 'o' } })
    expect(r.jahr).toBe(2026); expect(r.monat).toBe(7); expect(r.betrag).toBe(1290); expect(r.lieferant).toBe('Rewe')
    expect(r.id).toBe('id1'); expect(r.createdAt).toBe(5)
    expect(r.pdfBlob.type).toBe('application/pdf')
    expect(r.thumbnailDataUrl.startsWith('data:image')).toBe(true)
  })
})
```

- [ ] **Step 2: FAIL** — Run: `npm test -- saveDraft`

- [ ] **Step 3: `src/ui/EditReceipt.tsx`** (Komponente + reine Bau-Funktion)

```tsx
import { useEffect, useRef, useState } from 'preact/hooks'
import { mountCropEditor } from '../cropEditor'
import { detectQuad, warp } from '../detect'
import { enhanceCanvas } from '../enhance'
import { buildPdf } from '../pdf'
import { recognizeFirstPage } from '../ocr'
import { extractFields } from '../ocr/extractFields'
import { deriveYearMonth } from '../model/receipt'
import { saveReceipt } from '../db/receiptStore'
import { draftPages, goto } from '../state/appState'
import type { Receipt } from '../types'
import { Button } from './components/Button'
import { Field } from './components/Field'

export interface FormFields { belegdatum: string; betrag: number | null; lieferant: string; kategorie: string; tags: string[]; notiz: string; ocrText: string }

export function buildReceiptFromForm(input: { pages: HTMLCanvasElement[]; form: FormFields; now: number; id: string }): Receipt {
  const { jahr, monat } = deriveYearMonth(input.form.belegdatum)
  const images = input.pages.map(c => c.toDataURL('image/jpeg', 0.85))
  return {
    id: input.id, createdAt: input.now,
    belegdatum: input.form.belegdatum, jahr, monat,
    betrag: input.form.betrag, lieferant: input.form.lieferant, kategorie: input.form.kategorie,
    tags: input.form.tags, notiz: input.form.notiz, ocrText: input.form.ocrText,
    pageBlobs: [], pdfBlob: buildPdf(images), thumbnailDataUrl: images[0],
  }
}

function todayIso(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export function EditReceipt() {
  const pages = draftPages.value
  const holderRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ getQuad(): any; destroy(): void } | null>(null)
  const [form, setForm] = useState<FormFields>({ belegdatum: todayIso(), betrag: null, lieferant: '', kategorie: 'Sonstiges', tags: [], notiz: '', ocrText: '' })
  const [tagInput, setTagInput] = useState('')

  useEffect(() => {
    if (!pages.length || !holderRef.current) return
    editorRef.current = mountCropEditor(holderRef.current, pages[pages.length - 1], detectQuadFullFrame(pages[pages.length - 1]))
    ;(async () => {
      try {
        const text = await recognizeFirstPage(pages[0].toDataURL('image/jpeg', 0.85))
        const f = extractFields(text)
        setForm(prev => ({ ...prev, ocrText: text, belegdatum: f.belegdatum ?? prev.belegdatum, betrag: f.betrag ?? prev.betrag, lieferant: f.lieferant ?? prev.lieferant }))
      } catch { /* OCR optional */ }
    })()
    return () => editorRef.current?.destroy()
  }, [])

  async function save() {
    const r = buildReceiptFromForm({ pages, form, now: Date.now(), id: `r${Date.now()}` })
    await saveReceipt(r)
    draftPages.value = []
    goto('archive')
  }
  function addTag() { const t = tagInput.trim(); if (t) { setForm(f => ({ ...f, tags: [...f.tags, t] })); setTagInput('') } }

  if (!pages.length) { goto('scan'); return null }
  return (
    <div class="edit" style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <div ref={holderRef} class="card" />
      <div class="card">
        <Field label="Belegdatum"><input type="date" value={form.belegdatum} onInput={e => setForm(f => ({ ...f, belegdatum: (e.target as HTMLInputElement).value }))} /></Field>
        <Field label="Betrag (€)"><input inputMode="decimal" value={form.betrag !== null ? (form.betrag/100).toFixed(2).replace('.', ',') : ''} onInput={e => setForm(f => ({ ...f, betrag: parseEuro((e.target as HTMLInputElement).value) }))} /></Field>
        <Field label="Lieferant"><input value={form.lieferant} onInput={e => setForm(f => ({ ...f, lieferant: (e.target as HTMLInputElement).value }))} /></Field>
        <Field label="Kategorie"><input value={form.kategorie} onInput={e => setForm(f => ({ ...f, kategorie: (e.target as HTMLInputElement).value }))} /></Field>
        <Field label="Tags"><input value={tagInput} onInput={e => setTagInput((e.target as HTMLInputElement).value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} /></Field>
        <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap">{form.tags.map(t => <span class="chip">{t}</span>)}</div>
        <Field label="Notiz"><textarea value={form.notiz} onInput={e => setForm(f => ({ ...f, notiz: (e.target as HTMLTextAreaElement).value }))} /></Field>
      </div>
      <div style="display:flex;gap:var(--sp-3)">
        <Button onClick={save}>Speichern</Button>
        <Button variant="ghost" onClick={() => { draftPages.value = []; goto('scan') }}>Verwerfen</Button>
      </div>
    </div>
  )
}

function parseEuro(s: string): number | null { const m = s.replace(/[^\d.,]/g,'').replace(/\./g,'').replace(',', '.'); const v = Number(m); return isFinite(v) && m ? Math.round(v*100) : null }
function detectQuadFullFrame(c: HTMLCanvasElement) { return { topLeft:{x:0,y:0}, topRight:{x:c.width,y:0}, bottomRight:{x:c.width,y:c.height}, bottomLeft:{x:0,y:c.height} } }
```
Achte auf `noUnusedLocals` (an): keine ungenutzten Importe stehen lassen.

- [ ] **Step 4: PASS + Build**

Run: `npm test -- saveDraft && npm run build`
Expected: Test grün; Build ok (ungenutzte Importe entfernen, damit `noUnusedLocals` nicht meckert).

- [ ] **Step 5: Commit**

```bash
git add src/ui/EditReceipt.tsx test/saveDraft.test.ts
git commit -m "feat: add edit-receipt view with crop, ocr prefill and save"
```

---

### Task 12: Archiv-View (Ordner Jahr/Monat + Suche/Filter)

**Files:**
- Create: `src/ui/Archive.tsx`
- Test: (Store bereits getestet; Komponente Build + manuell)

**Interfaces:**
- Consumes: `listMonths`/`queryReceipts` (`receiptStore`), `formatEuro`/`monthKey` (`model/receipt`), `archiveQuery`/`openDetail`/`goto` (`appState`)
- Produces: `Archive()` — zeigt Monatskacheln, Suchfeld, gefilterte Liste.

- [ ] **Step 1: `src/ui/Archive.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { listMonths, queryReceipts } from '../db/receiptStore'
import { formatEuro } from '../model/receipt'
import { archiveQuery, openDetail, goto } from '../state/appState'
import type { Receipt } from '../types'
import { Button } from './components/Button'
import { Card } from './components/Card'

const MONTHS = ['','Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']

export function Archive() {
  const [months, setMonths] = useState<{ jahr:number; monat:number; count:number; summe:number }[]>([])
  const [results, setResults] = useState<Receipt[]>([])
  const [text, setText] = useState('')
  const q = archiveQuery.value

  async function refresh() {
    setMonths(await listMonths())
    setResults(await queryReceipts(q))
  }
  useEffect(() => { refresh() }, [JSON.stringify(q)])

  function openMonth(jahr: number, monat: number) { archiveQuery.value = { jahr, monat }; }
  function clearFilter() { archiveQuery.value = {} }

  return (
    <div class="archive" style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <div style="display:flex;gap:var(--sp-3);align-items:center">
        <input placeholder="Suchen (Lieferant, Notiz, Text …)" value={text}
          onInput={e => setText((e.target as HTMLInputElement).value)}
          onKeyDown={e => { if (e.key==='Enter') archiveQuery.value = { ...q, text: text || undefined } }}
          style="flex:1;min-height:44px;padding:0 var(--sp-3);border:1px solid var(--border);border-radius:var(--radius-sm)" />
        <Button onClick={() => goto('scan')}>+ Beleg</Button>
      </div>

      {(q.jahr || q.text || q.lieferant || q.tag) &&
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="color:var(--text-muted)">{results.length} Treffer</span>
          <Button variant="ghost" onClick={clearFilter}>Filter zurücksetzen</Button>
        </div>}

      {!q.jahr && !q.text && !q.lieferant && !q.tag
        ? <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:var(--sp-3)">
            {months.map(m => <Card onClick={() => openMonth(m.jahr, m.monat)}>
              <div style="font-size:var(--fs-lg);font-weight:700">{MONTHS[m.monat]} {m.jahr}</div>
              <div style="color:var(--text-muted)">{m.count} Belege · {formatEuro(m.summe)}</div>
            </Card>)}
            {!months.length && <p style="color:var(--text-muted)">Noch keine Belege. Tippe „+ Beleg".</p>}
          </div>
        : <div style="display:grid;gap:var(--sp-2)">
            {results.map(r => <Card onClick={() => openDetail(r.id)}>
              <div style="display:flex;gap:var(--sp-3);align-items:center">
                <img src={r.thumbnailDataUrl} style="width:48px;height:48px;object-fit:cover;border-radius:var(--radius-sm)" />
                <div style="flex:1"><div style="font-weight:600">{r.lieferant || 'Ohne Lieferant'}</div><div style="color:var(--text-muted);font-size:var(--fs-sm)">{r.belegdatum}</div></div>
                <div style="font-weight:600">{formatEuro(r.betrag)}</div>
              </div>
            </Card>)}
          </div>}
    </div>
  )
}
```

- [ ] **Step 2: Build** — Run: `npm run build && npm test` → Build ok, Tests grün.

- [ ] **Step 3: Commit**

```bash
git add src/ui/Archive.tsx
git commit -m "feat: add archive view with month folders, search and filter"
```

---

### Task 13: Beleg-Detail-View (Vorschau + Bearbeiten + Aktionen)

**Files:**
- Create: `src/ui/ReceiptDetail.tsx`

**Interfaces:**
- Consumes: `getReceipt`/`saveReceipt`/`deleteReceipt` (`receiptStore`), `sharePdf` (`share`), `formatEuro` (`model/receipt`), `selectedId`/`goto` (`appState`)
- Produces: `ReceiptDetail()`.

- [ ] **Step 1: `src/ui/ReceiptDetail.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { getReceipt, saveReceipt, deleteReceipt } from '../db/receiptStore'
import { sharePdf } from '../share'
import { formatEuro } from '../model/receipt'
import { selectedId, goto, archiveQuery } from '../state/appState'
import type { Receipt } from '../types'
import { Button } from './components/Button'
import { Field } from './components/Field'

export function ReceiptDetail() {
  const [r, setR] = useState<Receipt | null>(null)
  useEffect(() => { const id = selectedId.value; if (id) getReceipt(id).then(x => setR(x ?? null)) }, [])
  if (!r) return <div style="padding:var(--sp-4)">Lädt …</div>

  async function persist(patch: Partial<Receipt>) { const next = { ...r!, ...patch }; setR(next); await saveReceipt(next) }
  async function share() { await sharePdf(r!.pdfBlob, `${r!.lieferant || 'Beleg'}-${r!.belegdatum}.pdf`) }
  async function remove() { if (confirm('Beleg löschen?')) { await deleteReceipt(r!.id); goto('archive') } }

  return (
    <div style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <img src={r.thumbnailDataUrl} style="width:100%;max-width:420px;border-radius:var(--radius);border:1px solid var(--border)" />
      <div class="card">
        <Field label="Lieferant"><input value={r.lieferant} onChange={e => persist({ lieferant: (e.target as HTMLInputElement).value })} /></Field>
        <Field label="Belegdatum"><input type="date" value={r.belegdatum} onChange={e => { const v=(e.target as HTMLInputElement).value; const [y,m]=v.split('-').map(Number); persist({ belegdatum: v, jahr: y, monat: m }) }} /></Field>
        <div style="color:var(--text-muted)">Betrag: {formatEuro(r.betrag)} · {r.kategorie}</div>
        {r.notiz && <p>{r.notiz}</p>}
      </div>
      <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">
        <Button onClick={share}>PDF teilen</Button>
        <Button variant="secondary" onClick={() => goto('archive')}>Zurück</Button>
        <Button variant="danger" onClick={remove}>Löschen</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build + Commit**

Run: `npm run build && npm test` → ok.
```bash
git add src/ui/ReceiptDetail.tsx
git commit -m "feat: add receipt detail view with edit, share and delete"
```

---

### Task 14: Einstellungen/Backup-View

**Files:**
- Create: `src/ui/Settings.tsx`

**Interfaces:**
- Consumes: `exportArchive`/`importArchive` (`backup/zipBackup`), `theme`/`applyTheme`/`goto` (`appState`), `sharePdf`-Muster für Download (eigener Download-Helfer)
- Produces: `Settings()`.

- [ ] **Step 1: `src/ui/Settings.tsx`**

```tsx
import { useEffect, useState } from 'preact/hooks'
import { exportArchive, importArchive } from '../backup/zipBackup'
import { theme, applyTheme, goto } from '../state/appState'
import { Button } from './components/Button'
import { Field } from './components/Field'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function Settings() {
  const [usage, setUsage] = useState<string>('')
  const [msg, setMsg] = useState<string>('')
  useEffect(() => { navigator.storage?.estimate?.().then(e => { const mb=(n?:number)=>Math.round((n??0)/1e6); setUsage(`${mb(e.usage)} MB von ${mb(e.quota)} MB genutzt`) }) }, [])

  async function doExport() { const blob = await exportArchive(); download(blob, `belegablage-backup-${Date.now()}.zip`) }
  async function doImport(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return
    const mode = confirm('OK = zusammenführen (behält Bestehendes), Abbrechen = ersetzen') ? 'merge' : 'replace'
    const n = await importArchive(file, mode as 'merge'|'replace'); setMsg(`${n} Belege importiert.`)
  }

  return (
    <div style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <div class="card">
        <h3>Backup</h3>
        <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap">
          <Button onClick={doExport}>Archiv exportieren (ZIP)</Button>
          <label class="btn btn-secondary">Importieren<input type="file" accept=".zip" hidden onChange={doImport} /></label>
        </div>
        {msg && <p style="color:var(--success)">{msg}</p>}
        <p style="color:var(--text-muted)">{usage}</p>
      </div>
      <div class="card">
        <Field label="Darstellung">
          <select value={theme.value} onChange={e => { theme.value = (e.target as HTMLSelectElement).value as any; applyTheme() }}>
            <option value="system">System</option><option value="light">Hell</option><option value="dark">Dunkel</option>
          </select>
        </Field>
      </div>
      <Button variant="ghost" onClick={() => goto('archive')}>Zurück</Button>
    </div>
  )
}
```

- [ ] **Step 2: Build + Commit**

Run: `npm run build && npm test` → ok.
```bash
git add src/ui/Settings.tsx
git commit -m "feat: add settings view with zip backup and theme toggle"
```

---

### Task 15: App-Shell / Router + Navigation + Integration

**Files:**
- Modify: `src/app.tsx`
- Modify: `src/styles/global.css` (Nav-Leiste)

**Interfaces:**
- Consumes: alle Views + `view`/`applyTheme` (`appState`)
- Produces: `App()` rendert je `view` die passende Komponente + untere Tab-Navigation (Archiv / Scan / Einstellungen).

- [ ] **Step 1: `src/app.tsx`**

```tsx
import { useEffect } from 'preact/hooks'
import { view, goto, applyTheme } from './state/appState'
import { Archive } from './ui/Archive'
import { Scan } from './ui/Scan'
import { EditReceipt } from './ui/EditReceipt'
import { ReceiptDetail } from './ui/ReceiptDetail'
import { Settings } from './ui/Settings'

export function App() {
  useEffect(() => { applyTheme() }, [])
  const v = view.value
  return (
    <div class="app-shell">
      <main class="app-main">
        {v === 'archive' && <Archive />}
        {v === 'scan' && <Scan />}
        {v === 'edit' && <EditReceipt />}
        {v === 'detail' && <ReceiptDetail />}
        {v === 'settings' && <Settings />}
      </main>
      {(v === 'archive' || v === 'settings') &&
        <nav class="tabbar">
          <button class={v==='archive'?'active':''} onClick={() => goto('archive')}>Archiv</button>
          <button onClick={() => goto('scan')}>Scannen</button>
          <button class={v==='settings'?'active':''} onClick={() => goto('settings')}>Einstellungen</button>
        </nav>}
    </div>
  )
}
```

- [ ] **Step 2: Nav-Styles** — an `src/styles/global.css` anhängen

```css
.app-shell { min-height: 100dvh; display: flex; flex-direction: column; }
.app-main { flex: 1; max-width: 720px; width: 100%; margin: 0 auto; }
.tabbar { position: sticky; bottom: 0; display: flex; background: var(--surface); border-top: 1px solid var(--border); }
.tabbar button { flex: 1; min-height: 56px; border: 0; background: none; color: var(--text-muted); font-weight: 600; }
.tabbar button.active { color: var(--accent); }
```

- [ ] **Step 3: Verifizieren (voll)**

Run: `npm test && npm run build`
Expected: alle Unit-Tests grün; Build erzeugt `dist/` inkl. PWA-Artefakte (`dist/sw.js`, `dist/manifest.webmanifest`); keine stray `.js`; `tsc` ohne Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/app.tsx src/styles/global.css
git commit -m "feat: wire app shell, view router and tab navigation"
```

---

### Task 16: PWA-Manifest + README-Aktualisierung + Abschluss-Sanity

**Files:**
- Modify: `vite.config.ts` (Manifest-Name), `README.md`

**Interfaces:**
- Consumes: —
- Produces: aktualisiertes Manifest (Name „Belegablage"), README beschreibt v2.

- [ ] **Step 1: Manifest-Name in `vite.config.ts`**

Setze im VitePWA-`manifest`: `name: 'Belegablage'`, `short_name: 'Belege'` (Icons/`start_url`/`display` unverändert lassen).

- [ ] **Step 2: `README.md` aktualisieren** — Abschnitt „v2 Belegablage": Live-Erfassung, Archiv (Jahr/Monat + Tags), IndexedDB-Persistenz, ZIP-Backup, Dark Mode. Deploy unverändert.

- [ ] **Step 3: Abschluss-Sanity**

Run: `npm test && npm run build`
Expected: grün, Build ok, PWA-Artefakte vorhanden.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts README.md
git commit -m "chore: update pwa manifest name and readme for v2"
```

---

## Self-Review (durchgeführt)

**Spec-Abdeckung:** Live-Erfassung (T8/T10), Ecken-Korrektur (T11 via cropEditor), Entzerrung+Aufhellung (T10/T11 via detect/enhance), Metadaten kompakt + OCR-Vorbefüllung (T6/T11), Jahr/Monat-Ablage + Tags (T3/T5/T12), persistentes Archiv IndexedDB (T4/T5), Suche/Filter (T5/T12), Monatssumme (T5/T12), Beleg-Detail + teilen/löschen (T13), PDF/Share (T11/T13 via pdf/share), ZIP-Backup (T7/T14), Galerie-Import (T10), Design-Tokens/Light+Dark (T2/T9/T14), Preact-Shell (T1/T15), PWA (T15/T16). Alle Spec-Punkte abgedeckt.

**Platzhalter:** Code in allen Schritten konkret; die Views sind funktionsfähig (Feinschliff visuell via frontend-design in der Umsetzung, aber lauffähig). Kein „TBD/TODO".

**Typ-Konsistenz:** `Receipt`-Felder identisch zwischen `types.ts`, Store, Backup, `buildReceiptFromForm`. `Quad`/`Point` aus `types`. Store-Signaturen (`saveReceipt`/`getReceipt`/`deleteReceipt`/`allReceipts`/`listMonths`/`queryReceipts`) konsistent zwischen T5 und Consumers (T11–T14). `extractFields`-Rückgabe (`belegdatum/betrag/lieferant`) konsistent mit T11-Nutzung. Signals (`view/draftPages/selectedId/archiveQuery/theme` + `goto/openDetail/applyTheme`) konsistent T9↔T10–T15. `dateStampFallback`-Referenz aus T11 entfernt (existierte nicht).
