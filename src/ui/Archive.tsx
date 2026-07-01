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
