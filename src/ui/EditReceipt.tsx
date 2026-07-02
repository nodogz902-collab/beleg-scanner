import { useEffect, useRef, useState } from 'preact/hooks'
import { mountCropEditor } from '../cropEditor'
import { warp, isFullFrame } from '../detect'
import { photoEnhance, documentGray } from '../enhance'
import { buildPdf } from '../pdf'
import { recognizeFirstPage } from '../ocr'
import { extractFields } from '../ocr/extractFields'
import { deriveYearMonth, parseEuroToCents } from '../model/receipt'
import { saveReceipt } from '../db/receiptStore'
import { draftPages, goto } from '../state/appState'
import type { Receipt, Quad } from '../types'
import { Button } from './components/Button'
import { Field } from './components/Field'

export interface FormFields { belegdatum: string; einscannungsdatum: string; betrag: number | null; kategorie: string; tags: string[]; notiz: string; ocrText: string }

export function buildReceiptFromForm(input: { pages: HTMLCanvasElement[]; form: FormFields; now: number; id: string }): Receipt {
  const { jahr, monat } = deriveYearMonth(input.form.belegdatum)
  const images = input.pages.map(c => c.toDataURL('image/jpeg', 0.85))
  return {
    id: input.id, createdAt: input.now,
    belegdatum: input.form.belegdatum, einscannungsdatum: input.form.einscannungsdatum, jahr, monat,
    betrag: input.form.betrag, lieferant: '', kategorie: input.form.kategorie,
    tags: input.form.tags, notiz: input.form.notiz, ocrText: input.form.ocrText,
    pageBlobs: [], pdfBlob: buildPdf(images), thumbnailDataUrl: images[0],
  }
}

/** Zuschnitt fuer Anzeige + PDF: entzerrtes, veredeltes Farbfoto (entschattet, entrauscht, geschaerft). */
export function croppedCanvas(original: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const w = warp(original, quad)
  photoEnhance(w)
  return w
}

/**
 * Zuschnitt fuer OCR: derselbe Crop, aber nur Kontrast-Streckung (Graustufen)
 * statt harter Binarisierung — die S/W-Optik zerlegt duenne Schrift und
 * verschlechtert die Texterkennung, daher hier bewusst getrennt.
 */
export function croppedForOcr(original: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const w = warp(original, quad)
  documentGray(w)
  return w
}

export function mergeOcrIntoForm(
  prev: FormFields,
  ocrText: string,
  extracted: { belegdatum: string | null; betrag: number | null },
  touched: boolean,
): FormFields {
  if (touched) return { ...prev, ocrText }
  return {
    ...prev,
    ocrText,
    belegdatum: extracted.belegdatum ?? prev.belegdatum,
    betrag: extracted.betrag ?? prev.betrag,
  }
}

function todayIso(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

export function EditReceipt() {
  const pages = draftPages.value
  const holderRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<{ getQuad(): Quad; destroy(): void } | null>(null)
  const quadRef = useRef<Quad | null>(null)
  const croppedRef = useRef<HTMLCanvasElement | null>(null)
  const touchedRef = useRef(false)
  const ocrRunRef = useRef(0)
  const [mode, setMode] = useState<'frame' | 'cropped'>('frame')
  const [progress, setProgress] = useState<number | null>(null)
  const [noDetection, setNoDetection] = useState(false)
  const [form, setForm] = useState<FormFields>({ belegdatum: todayIso(), einscannungsdatum: todayIso(), betrag: null, kategorie: 'Sonstiges', tags: [], notiz: '', ocrText: '' })
  const [tagInput, setTagInput] = useState('')

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

  useEffect(() => () => { ocrRunRef.current++ }, [])

  async function confirmCrop() {
    const last = pages[pages.length - 1]
    const quad = editorRef.current?.getQuad() ?? quadRef.current ?? last.quad
    quadRef.current = quad
    const run = ++ocrRunRef.current
    // Balken sofort auf dem Zuschnitt-Screen zeigen; Screen-Wechsel erst am Ende.
    setProgress(0)
    // Einen Frame warten, damit der Balken gezeichnet wird, bevor die synchrone
    // Bild-Aufbereitung (warp + photoEnhance) den Main-Thread kurz blockiert.
    await new Promise(r => requestAnimationFrame(() => r(null)))
    if (ocrRunRef.current !== run) return
    croppedRef.current = croppedCanvas(last.original, quad)
    try {
      const ocrUrl = croppedForOcr(last.original, quad).toDataURL('image/jpeg', 0.85)
      const text = await recognizeFirstPage(ocrUrl, p => {
        if (ocrRunRef.current === run) setProgress(Math.round(p * 100))
      })
      if (ocrRunRef.current === run) {
        setForm(prev => mergeOcrIntoForm(prev, text, extractFields(text), touchedRef.current))
        setProgress(100)
        setMode('cropped') // fertig -> Ergebnis-Screen
        setTimeout(() => { if (ocrRunRef.current === run) setProgress(null) }, 400)
      }
    } catch {
      if (ocrRunRef.current === run) { setMode('cropped'); setProgress(null) } // OCR optional
    }
  }

  async function save() {
    const lastIdx = pages.length - 1
    const finalPages = pages.map((p, i) => {
      if (i === lastIdx) {
        return croppedRef.current ?? croppedCanvas(p.original, quadRef.current ?? p.quad)
      }
      return croppedCanvas(p.original, p.quad)
    })
    const r = buildReceiptFromForm({ pages: finalPages, form, now: Date.now(), id: `r${Date.now()}` })
    await saveReceipt(r)
    draftPages.value = []
    goto('archive')
  }
  function addTag() { const t = tagInput.trim(); if (t) { setForm(f => ({ ...f, tags: [...f.tags, t] })); setTagInput('') } }

  if (!pages.length) { goto('scan'); return null }
  return (
    <div class="edit" style="padding:var(--sp-4);display:grid;gap:var(--sp-4)">
      <div ref={holderRef} class="card" />
      {progress !== null &&
        <div class="scan-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div class="scan-progress-track"><div class="scan-progress-fill" style={`width:${progress}%`} /></div>
          <span class="scan-progress-label">Beleg wird verarbeitet … {progress}%</span>
        </div>}
      {mode === 'frame' && noDetection &&
        <p class="hint" style="color:var(--color-danger,#c00);margin:0">Kein Dokument erkannt – Rahmen bitte anpassen.</p>}
      {mode === 'frame'
        ? <Button onClick={confirmCrop} disabled={progress !== null}>Zuschnitt bestätigen</Button>
        : <Button variant="secondary" onClick={() => { setProgress(null); setMode('frame') }}>Neu zuschneiden</Button>}
      {mode === 'cropped' &&
        <div class="card">
          <Field label="Belegdatum"><input type="date" value={form.belegdatum} onInput={e => { const v = (e.target as HTMLInputElement).value; if (!v) return; touchedRef.current = true; setForm(f => ({ ...f, belegdatum: v })) }} /></Field>
          <Field label="Einscannungsdatum"><input type="date" value={form.einscannungsdatum} onInput={e => { const v = (e.target as HTMLInputElement).value; if (!v) return; setForm(f => ({ ...f, einscannungsdatum: v })) }} /></Field>
          <Field label="Betrag (€)"><input inputMode="decimal" value={form.betrag !== null ? (form.betrag/100).toFixed(2).replace('.', ',') : ''} onInput={e => { touchedRef.current = true; setForm(f => ({ ...f, betrag: parseEuroToCents((e.target as HTMLInputElement).value) })) }} /></Field>
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
}
