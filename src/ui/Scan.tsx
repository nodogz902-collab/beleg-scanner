import { useEffect, useRef, useState } from 'preact/hooks'
import { startCamera, stopCamera, captureFrame, downscale } from '../camera'
import { startLiveDetect } from '../scan/liveDetect'
import { detectQuad } from '../detect'
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
  const processedRef = useRef(false)

  async function process(full: HTMLCanvasElement) {
    if (processedRef.current) return
    processedRef.current = true
    cleanup()
    setBusy(true)
    const quad = await detectQuad(full)
    draftPages.value = [...draftPages.value, { original: full, quad }]
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
