# Beleg-Scanner — Design

**Datum:** 2026-07-01
**Status:** Freigegeben (Brainstorming abgeschlossen)

## Ziel

Eine kleine, installierbare Web-App (PWA), die auf iOS-Geräten (Safari) funktioniert und über einen GitHub-Pages-Link erreichbar ist. Ablauf:

1. Kamera aufnehmen
2. Dokument/Beleg erkennen und Auto-Crop-Vorschlag mit ziehbaren Ecken anbieten
3. Bild perspektivisch auf ein sauberes Rechteck entzerren und automatisch aufhellen/kontrastieren
4. Mehrere Seiten sammeln
5. OCR-basierten Dateinamen vorschlagen
6. Mehrseitiges PDF erzeugen
7. PDF über die iOS-Share-Funktion teilen (meist per Mail)

Die Web-App ist eine bewusste Alternative zum nativen `RechnungsScanner` (Swift/VisionKit). Sie benötigt keinen App-Store und läuft per Link auf jedem iPhone.

## Zentrale Einschränkung (Kontext)

Eine Web-App kann **nicht** Apples nativen Dokumentenscanner (VisionKit) nutzen:

- **Kamera:** nur über `getUserMedia` und nur unter **HTTPS** (GitHub Pages liefert HTTPS).
- **Eckenerkennung + Entzerrung:** müssen in JavaScript/WASM erfolgen (OpenCV.js via `jscanify`).
- **Teilen:** über die **Web Share API** (`navigator.share` mit Datei), unterstützt ab iOS Safari 15.

Kostenpunkt: OpenCV.js (~8 MB WASM) und das Tesseract-Sprachmodell (~10–15 MB) sind groß. Beides wird **lazy geladen** und im **Service-Worker gecacht**, sodass nur der erste Aufruf spürbar langsam ist.

## Getroffene Entscheidungen

| Thema | Entscheidung |
|---|---|
| Erkennungsgrad | Halb-automatisch: Foto → Auto-Crop-Vorschlag mit ziehbaren Ecken |
| Seiten | Mehrseitig mit Seitenliste |
| Dateiname | OCR-Titelvorschlag (Tesseract.js, deutsches Modell) |
| Hosting | GitHub Pages (privater Account `nodogz902-collab`) |
| Bildaufbereitung | Auto-Helligkeit + Kontrast (Farbe bleibt) |
| Teilen | Web Share API mit Download-Fallback |
| Stack | Vite + TypeScript (vanilla), `jscanify`/OpenCV.js, Tesseract.js, jsPDF, vite-plugin-pwa |

## Stack

- **Vite + TypeScript**, vanilla (kein UI-Framework — hält den Bundle klein neben WASM + OCR-Modell)
- **jscanify + OpenCV.js** — Eckenerkennung + perspektivische Entzerrung
- **Tesseract.js** (deutsches Modell) — OCR für Titelvorschlag
- **jsPDF** — mehrseitiges PDF aus Seitenbildern (in `pdf.ts` gekapselt, austauschbar gegen pdf-lib)
- **Web Share API** — Teilen, mit Download-Fallback
- **vite-plugin-pwa** — installierbar, Service-Worker cacht App-Shell + WASM + OCR-Modell

## Module (je eine klare Aufgabe)

| Modul | Aufgabe | Abhängigkeiten | Testbar |
|---|---|---|---|
| `camera.ts` | `getUserMedia` (Rückkamera `facingMode: environment`), Standbild → Canvas | Browser-API | über Fixture-Bild statt Kamera |
| `detect.ts` | jscanify: 4 Ecken finden; Warp auf Rechteck bei gegebenen Ecken | jscanify/OpenCV.js | ja (Fixture-Bild) |
| `cropEditor.ts` | Foto + 4 ziehbare Ecken-Handles, gibt finale Ecken zurück | DOM/Canvas | UI/manuell |
| `enhance.ts` | Auto-Helligkeit/Kontrast (Histogramm-Stretch) auf Canvas | — | ja (bekanntes Pixel-Array) |
| `pages.ts` | Seitenliste (Bild-Blob + Thumbnail): hinzufügen, umsortieren, löschen | — | ja |
| `ocr.ts` | Tesseract auf Seite 1 → Titelvorschlag per Heuristik | Tesseract.js | ja (Text → Name, Tesseract gestubbt) |
| `pdf.ts` | Seitenbilder → PDF-Blob | jsPDF | ja (PDF parsen, N Seiten) |
| `share.ts` | `navigator.share({files})`, Fallback Download-Link | Browser-API | ja (Interface gestubbt) |
| `app.ts` | Flow-/Screen-Steuerung, verdrahtet die Module | alle | — |

**Isolationsprinzip:** Kamera und Share liegen hinter dünnen Interfaces, damit die Verarbeitungs-Pipeline (`detect → crop → enhance → pages → pdf`) mit einem Fixture-Bild headless getestet werden kann.

## Screens & Datenfluss

1. **Aufnahme** — Livebild-Vorschau + Auslöser → Standbild (Canvas)
2. **Zuschneiden** — Foto mit auto-vorgeschlagenen Ecken; Aktionen „Neu aufnehmen" / „Übernehmen" → Warp + Aufhellen
3. **Seiten** — Thumbnail-Liste, „+ Seite hinzufügen", umsortieren, löschen → „Fertig"
4. **Name & Teilen** — OCR-Spinner → Dateiname vorausgefüllt (editierbar, Default `Beleg-<Datum>.pdf`) → „PDF teilen" (Web Share) / „Herunterladen"

Datenfluss pro Seite:
`Kamera-Frame (Canvas) → detect (Ecken) → cropEditor (User-Korrektur) → detect.warp → enhance → pages.add (mit Thumbnail)`

Am Ende:
`pages → ocr (Seite 1 → Titel) → Dateiname → pdf.build → share`

## Fehlerbehandlung

- **Kamera verweigert / kein HTTPS:** klare Meldung + Hinweis, wie man Kamerazugriff in den Safari-Einstellungen erlaubt.
- **Erkennung schlägt fehl:** Ecken auf Vollbild-Rahmen setzen; der User zieht manuell nach.
- **OpenCV/Tesseract langsam oder Ladefehler:** Ladeindikator; bei OCR-Fehler Datum-Default-Name statt Vorschlag.
- **Web Share nicht unterstützt (älteres iOS) oder ohne Datei-Support:** Fallback auf PDF-Download.
- **Große Bilder:** vor OCR und PDF herunterskalieren, um iPhone-Speicher zu schonen.

## Tests

- **Unit (Vitest):** `enhance` (Histogramm-Stretch auf bekanntem Pixel-Array), `pdf` (N Bilder → PDF mit N Seiten, per Parser geprüft), `ocr`-Heuristik (Text → Dateiname), `pages`-Store (hinzufügen/umsortieren/löschen).
- **Pipeline mit Fixture:** `detect → crop → enhance → pdf` über ein eingebettetes Testbild ohne Kamera.
- **Manuell auf echtem iPhone:** Kamera, Live-Erkennungsqualität, Share-Sheet an Mail (iOS-Safari-Kamera lässt sich nicht automatisieren).

## Deployment

- Neues Repo auf dem privaten GitHub-Account `nodogz902-collab`.
- GitHub Actions: Vite-Build → Deploy nach `gh-pages` (bzw. Pages-Artifact).
- Ergebnis-URL-Muster: `https://nodogz902-collab.github.io/beleg-scanner/`.
- Vite `base` auf den Repo-Pfad setzen, damit Assets unter Pages korrekt laden.

## Bewusst nicht enthalten (YAGNI)

- Kein dauerhaftes Archiv/Backend — die App erzeugt ein PDF und teilt es; keine Datenhaltung über die Session hinaus.
- Kein S/W-Scan-Filter / Graustufen-Umschalter (nur Auto-Aufhellung).
- Keine Cloud-Speicherung, kein Login.
