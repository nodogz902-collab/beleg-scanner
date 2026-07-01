import { useEffect, useRef, useState } from 'preact/hooks'
import { mountCropEditor } from '../cropEditor'
import { warp } from '../detect'
import { enhanceCanvas } from '../enhance'
import { buildPdf } from '../pdf'
import { recognizeFirstPage } from '../ocr'
import { extractFields } from '../ocr/extractFields'
import { deriveYearMonth, parseEuroToCents } from '../model/receipt'
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
    editorRef.current = mountCropEditor(holderRef.current, pages[pages.length - 1].original, pages[pages.length - 1].quad)
    ;(async () => {
      try {
        const text = await recognizeFirstPage(pages[0].original.toDataURL('image/jpeg', 0.85))
        const f = extractFields(text)
        setForm(prev => ({ ...prev, ocrText: text, belegdatum: f.belegdatum ?? prev.belegdatum, betrag: f.betrag ?? prev.betrag, lieferant: f.lieferant ?? prev.lieferant }))
      } catch { /* OCR optional */ }
    })()
    return () => editorRef.current?.destroy()
  }, [])

  async function save() {
    const finalPages = pages.map((p, i) => {
      const quad = (i === pages.length - 1 && editorRef.current) ? editorRef.current.getQuad() : p.quad
      const w = warp(p.original, quad)
      enhanceCanvas(w)
      return w
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
      <div class="card">
        <Field label="Belegdatum"><input type="date" value={form.belegdatum} onInput={e => { const v = (e.target as HTMLInputElement).value; if (!v) return; setForm(f => ({ ...f, belegdatum: v })) }} /></Field>
        <Field label="Betrag (€)"><input inputMode="decimal" value={form.betrag !== null ? (form.betrag/100).toFixed(2).replace('.', ',') : ''} onInput={e => setForm(f => ({ ...f, betrag: parseEuroToCents((e.target as HTMLInputElement).value) }))} /></Field>
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
