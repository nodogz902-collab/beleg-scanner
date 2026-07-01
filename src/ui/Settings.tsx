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

  async function doExport() {
    try {
      const blob = await exportArchive()
      download(blob, `belegablage-backup-${Date.now()}.zip`)
    } catch {
      setMsg('Export fehlgeschlagen.')
    }
  }
  async function doImport(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]; if (!file) return
    const choice = prompt('Import-Modus wählen:\n\n"m" = Zusammenführen (behält vorhandene Belege)\n"r" = Ersetzen (löscht ALLE vorhandenen Belege!)\n\nAbbrechen bricht den Import ab.', 'm')
    input.value = ''
    if (choice === null) return                 // Abbrechen = nichts tun (kein Datenverlust)
    const mode: 'merge' | 'replace' = choice.trim().toLowerCase().startsWith('r') ? 'replace' : 'merge'
    try {
      const n = await importArchive(file, mode)
      setMsg(`${n} Belege importiert.`)
    } catch {
      setMsg('Import fehlgeschlagen — Datei ist kein gültiges Backup-ZIP.')
    }
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
