import { useEffect, useState } from 'preact/hooks'
import { getReceipt, saveReceipt, deleteReceipt } from '../db/receiptStore'
import { sharePdf } from '../share'
import { formatEuro } from '../model/receipt'
import { selectedId, goto } from '../state/appState'
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
        <Field label="Belegdatum"><input type="date" value={r.belegdatum} onChange={e => { const v=(e.target as HTMLInputElement).value; if (!v) return; const [y,m]=v.split('-').map(Number); persist({ belegdatum: v, jahr: y, monat: m }) }} /></Field>
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
