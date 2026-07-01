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
