# Beleg-Scanner

Web-App (PWA) für iOS: Beleg fotografieren → zuschneiden/entzerren → mehrseitiges PDF → per Share teilen.

## v2 Belegablage

Belegablage v2 ist ein vollständiges digitales Rechnungsarchiv mit automatischer Erfassung und intelligentem Metadaten-Management.

**Kerneigenschaften:**

- **Live-Erfassung:** Automatische Dokumentenerkennung (jscanify) mit Live-Preview, automatisches Zuschneiden und Entzerrung (vier-Punkt-Perspektive-Korrektur)
- **OCR-Vorbefüllung:** Automatische Feldextraktion (Rechnungsdatum, Betrag, Lieferant) via Tesseract OCR in kompakter Metadatenform
- **Intelligente Ablage:** Automatisches Jahr- und Monats-Filing, tagging-basierte Kategorisierung, benutzerdefinierten Tags und Notizen
- **Persistentes Archiv:** IndexedDB-basierte lokale Speicherung mit Suchfunktion, Filterung nach Zeitraum/Betrag/Lieferant/Tags und monatliche Gesamtausgaben
- **Beleg-Details:** Vollständige Beleg-Ansicht mit PDF-Download, Teilen via Betriebssystem-Share-API und Löschen
- **Daten-Backup:** ZIP-Export/Import für Sicherung und Datenmigration
- **Import:** Galerie-Integration zur Nachverfassung existierender Belege
- **Design:** Light- und Dark-Mode mit automatischer Systemthema-Erkennung

**Deployment:** Unverändert auf GitHub Pages. Base URL: `/beleg-scanner/`

## Entwicklung
- `npm install`
- `npm run dev` (für Kamera lokal HTTPS nötig, z.B. `vite --https` oder Tunnel)
- `npm test`

## Deploy
Push auf `main` → GitHub Actions baut und deployt auf GitHub Pages.
URL: https://nodogz902-collab.github.io/beleg-scanner/
