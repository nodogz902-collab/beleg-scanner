# Beleg-Scanner v2 — „Belegablage" — Design

**Datum:** 2026-07-01
**Status:** Freigegeben (Brainstorming abgeschlossen)
**Baut auf:** v1 (Kamera → Crop → PDF → Share, live auf GitHub Pages). Siehe `2026-07-01-beleg-scanner-design.md`.

## Ziel

Aus dem v1-Scanner ein echtes, alltagstaugliches **Beleg-Ablage-Tool für die Buchhaltung** machen: Belege per **Live-Auto-Erfassung** digitalisieren, mit **OCR-vorbefüllten Metadaten** versehen, automatisch nach **Jahr/Monat + Tags** ablegen und in einem **persistenten, durchsuchbaren Archiv** wiederfinden. Inspiriert vom Beleg-Teil von sevDesk — bewusst **ohne** die volle Buchhaltungs-Suite.

## Scope

**In Scope (Belegablage-Kern):**
- Live-Auto-Dokumenterkennung + perspektivische Entzerrung
- Kompakte Metadaten pro Beleg (OCR-vorbefüllt, manuell korrigierbar)
- Automatische Ablage Jahr→Monat (nach Belegdatum) + freie Tags/Kategorien
- Persistentes Archiv (IndexedDB) mit Suche & Filtern
- PDF-Export / Teilen (iOS Web Share, Download-Fallback)
- ZIP-Backup (Export/Import des gesamten Archivs)
- Galerie-/Datei-Import als Kamera-Alternative
- Ruhig-professionelles Design, Light + Dark Mode

**Bewusst NICHT in Scope (YAGNI):**
- Rechnungen/Angebote schreiben, Banking/Kontoabgleich, DATEV-Export, USt-Voranmeldung, Mahnwesen
- Server/Backend, Cloud-Accounts, Multi-Device-Sync
- Volle Auswertung (Diagramme, CSV) — nur simple Monatssumme in der Ordneransicht

## Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Umfang | Belegablage-Kern (kein Accounting, kein Backend) |
| Datenhaltung | Lokal (IndexedDB) + 1-Klick-ZIP-Backup (Export/Import) |
| Erkennung | Live-Auto-Erfassung + Ecken-Korrektur, manueller Auslöser als Fallback |
| Organisation | Jahr/Monat automatisch (nach Belegdatum) + Tags/Kategorien |
| Metadaten | Kompakt: Belegdatum, Betrag (brutto), Lieferant, Kategorie, Tags, Notiz |
| Stack | Preact + @preact/signals (leichte reaktive Schicht), Pipeline-Module wiederverwendet |
| Design | Ruhig & professionell (Finanz-Software-Anmutung), Light + Dark |
| Zusatz | Galerie-/Datei-Import; Monatssumme in Ordneransicht |

## Stack & Architektur

- **Vite + TypeScript + Preact + @preact/signals** (~4 KB, neben ~10 MB OpenCV + ~15 MB OCR-Modell vernachlässigbar).
- **Wiederverwendung der v1-Pipeline-Module** (getestet/reviewed): `enhance`, `pdf`, `share`, `camera`, `detect` (Ecken-Geometrie + jscanify/OpenCV via `jscanify/client`, OpenCV-URL **4.9.0**), `ocr` (erweitert um Feld-Extraktion).
- **IndexedDB** via `idb`: Metadaten + Bild/PDF-Blobs.
- **State** über Signals (aktiver View, Archiv-Query/Filter, aktueller Beleg-Entwurf).
- **PWA** (vite-plugin-pwa) bleibt inkl. SW-Caching der schweren Assets.
- Der alte imperative `app.ts`-Flow wird durch die Preact-App ersetzt; die Pipeline-Module bleiben unverändert nutzbar.

## Datenmodell (IndexedDB)

Store `receipts` (key: `id`):
```
Receipt {
  id: string
  createdAt: number          // Erfassungszeit (ms)
  belegdatum: string         // 'YYYY-MM-DD', steuert Ablage
  jahr: number               // abgeleitet aus belegdatum
  monat: number              // 1..12, abgeleitet
  betrag: number | null      // brutto in Cent (null = unbekannt)
  lieferant: string
  kategorie: string
  tags: string[]
  notiz: string
  pageBlobs: Blob[]          // entzerrte JPEG-Seiten
  pdfBlob: Blob              // generiertes PDF (Cache)
  thumbnailDataUrl: string   // kleine Vorschau (Seite 1)
  ocrText: string            // Rohtext Seite 1 (für Suche)
}
```
Indexe: `belegdatum`, `[jahr+monat]`, `lieferant`, `kategorie`. Volltextsuche clientseitig über `lieferant`/`notiz`/`ocrText`/`tags`.
„Ordner" sind **abgeleitet** (jahr→monat), keine eigene Entität.

## Module (je eine klare Aufgabe)

| Modul | Aufgabe | Testbar |
|---|---|---|
| `db/database.ts` | idb-Setup, Schema/Migration, Store-Zugriff | ja (fake-indexeddb) |
| `db/receiptStore.ts` | CRUD + Abfragen (byMonth, filter, search, totals) | ja |
| `ocr/extractFields.ts` | Rohtext → `{ belegdatum?, betrag?, lieferant? }` (Heuristik) | ja (reine Funktion) |
| `backup/zipBackup.ts` | Export (PDFs + metadata.json → ZIP) / Import (Round-Trip) | ja |
| `scan/liveDetect.ts` | rAF-Loop: Frame → Kontur-Quad + Stabilitäts-/Flächen-Check | teils (Stabilitäts-Logik rein testbar) |
| `state/appState.ts` | Signals: view, draft, archiveQuery | ja (Signal-Logik) |
| `ui/…` (Preact) | Screens/Komponenten (siehe unten) | Logik-Teile via testing-library |
| bestehende: `detect`,`enhance`,`pdf`,`ocr`,`share`,`camera` | unverändert wiederverwendet | bereits getestet |

**Isolation:** Kamera, Live-Detection und Persistenz liegen hinter dünnen Interfaces; die reinen Teile (Feld-Extraktion, Store-Abfragen, ZIP-Round-Trip, Stabilitäts-Heuristik) sind headless testbar.

## Screens (Preact-Views)

1. **Aufnahme (Scan):** Live-Kamera-Vorschau mit grünem Auto-Rahmen (Overlay des erkannten Quads); löst automatisch aus, wenn das Quad über N Frames stabil ist und genug Fläche einnimmt. Manueller Auslöser als Fallback. „+ Seite" für Mehrseitigkeit. Galerie-/Datei-Import-Button als Alternative.
2. **Beleg bearbeiten:** entzerrte Seite(n) + Ecken-Korrektur (bestehender Crop-Editor, in Preact eingebettet); Metadaten-Formular — OCR füllt Belegdatum/Betrag/Lieferant vor; Kategorie (Vorschlagsliste), Tags (frei), Notiz. „Speichern" → Beleg + PDF ins Archiv.
3. **Archiv:** Ordner-Browsing Jahr → Monat als Kacheln (Anzahl + Monatssumme). Suchleiste + Filter (Lieferant, Kategorie, Tag, Zeitraum). Trefferliste mit Thumbnail, Datum, Betrag, Lieferant.
4. **Beleg-Detail:** große Vorschau (Seiten/PDF), alle Metadaten editierbar; Aktionen Teilen (PDF) / Exportieren / Löschen (mit Bestätigung).
5. **Einstellungen/Backup:** ZIP-Export & Import, Speicherplatz-Anzeige (StorageManager.estimate), Dark-Mode-Umschalter.

## Live-Erkennung

- `liveDetect` startet einen `requestAnimationFrame`-Loop; alle ~150 ms wird ein heruntergerechneter Videoframe (~640 px lange Kante) an `detect` (jscanify) gegeben → aktuelles Quad.
- Overlay zeichnet das Quad auf ein Canvas über dem Video.
- **Auto-Auslöser:** Quad-Ecken über N aufeinanderfolgende Ticks unterhalb einer Bewegungs-Schwelle **und** Quad-Fläche ≥ Mindestanteil des Bildes → Capture des vollauflösenden Frames → `detect`+`warp` in voller Auflösung.
- Reine Stabilitäts-/Flächen-Heuristik (`isStableQuad(history)`, `quadAreaRatio(quad, w, h)`) ist unit-getestet; der Loop/Kamera-Teil manuell.
- Fallback: manueller Auslöser jederzeit; bei dauerhaft fehlender Erkennung Vollbild-Quad + manuelle Ecken.

## Design-Sprache (ruhig & professionell)

- **Design-Tokens** (CSS custom properties): Neutral-Skala, ein Akzent (tiefes Petrol/Blau), Semantik-Farben (Erfolg/Warnung/Fehler), Typo-Skala, Spacing auf 8px-Grid, Radien, Schatten.
- **Light primär, Dark optional** (Token-Umschaltung via `data-theme`, respektiert `prefers-color-scheme`, manuell überschreibbar).
- Großzügiger Weißraum, klare Hierarchie, konsistente Komponenten (Button, Input, Chip/Tag, Card, Sheet/Dialog).
- Barrierearm: ausreichender Kontrast, sichtbare Fokuszustände, Touch-Ziele ≥ 44 px.
- Die konkrete visuelle Ausgestaltung (Farbwerte, Typografie, Komponenten-Look) übernimmt das **frontend-design-Skill** in der Implementierung; dieses Design legt die Richtung + Token-Struktur fest.

## Fehlerbehandlung & Edge Cases

- **Keine Kamera / Permission verweigert:** klare Meldung + Galerie-/Datei-Import als Alternative.
- **IndexedDB-Quota erreicht:** Warnung + Hinweis auf ZIP-Backup/Löschen.
- **OCR leer/fehlerhaft:** Felder leer lassen, manuell ausfüllen (kein Blocker).
- **Live-Erkennung findet nichts:** manueller Auslöser + Vollbild-Ecken-Fallback.
- **Backup-Import mit Konflikten:** Abfrage „zusammenführen (neue IDs) / ersetzen".
- **Große Bilder:** vor Speicherung/OCR herunterskalieren (v1-`downscale`).

## Tests

- **Unit (Vitest, fake-indexeddb):** `receiptStore` (CRUD, byMonth, filter, search, Monats-/Kategorie-Summen, jahr/monat-Ableitung), `extractFields` (Datum/Betrag/Lieferant-Heuristik inkl. deutscher Formate `12,90 €`, `01.07.2026`), `zipBackup` (Export→Import Round-Trip erhält Belege), `liveDetect` Stabilitäts-/Flächen-Heuristik, `appState`-Signals; bestehende `pdf`/`enhance`/`ocr`/`share`/`detect`-Geometrie-Tests bleiben.
- **Komponenten:** Preact-Formular-/Filter-Logik via @testing-library/preact (reine Logik).
- **Manuell am iPhone:** Live-Kamera-Erkennung/Auto-Auslöser, echtes OpenCV/Tesseract, Web Share.

## Deployment

Wie v1: GitHub Actions → Pages (`base: /beleg-scanner/`), Repo `nodogz902-collab/beleg-scanner`. v2 ersetzt die v1-App an derselben URL.
