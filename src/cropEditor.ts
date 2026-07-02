import type { Point, Quad } from './types'

export function clientToImage(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  imageW: number,
  imageH: number,
): Point {
  const nx = (clientX - rect.left) / rect.width
  const ny = (clientY - rect.top) / rect.height
  const x = Math.min(imageW, Math.max(0, Math.round(nx * imageW)))
  const y = Math.min(imageH, Math.max(0, Math.round(ny * imageH)))
  return { x, y }
}

const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const

export function mountCropEditor(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  initial: Quad,
  onChange?: (q: Quad) => void,
): { getQuad(): Quad; destroy(): void } {
  const quad: Quad = JSON.parse(JSON.stringify(initial))
  container.innerHTML = ''
  container.style.position = 'relative'
  canvas.style.width = '100%'
  canvas.style.display = 'block'
  container.appendChild(canvas)

  // Maske: dunkelt alles ausserhalb des Vierecks ab, damit sichtbar ist, was
  // weggeschnitten wird; darueber die Rahmenlinie. Griffe liegen per z-index darauf.
  const overlay = document.createElement('canvas')
  overlay.className = 'crop-mask'
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.pointerEvents = 'none'
  container.appendChild(overlay)

  const handles = CORNER_KEYS.map(key => {
    const el = document.createElement('div')
    el.className = 'corner-handle'
    el.dataset.key = key
    container.appendChild(el)
    return { key, el }
  })

  function drawMask(rect: { width: number; height: number }) {
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w === 0 || h === 0) return
    overlay.width = w
    overlay.height = h
    overlay.style.width = `${w}px`
    overlay.style.height = `${h}px`
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    const sx = w / canvas.width
    const sy = h / canvas.height
    const pts = CORNER_KEYS.map(k => ({ x: quad[k].x * sx, y: quad[k].y * sy }))
    const path = () => {
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
      ctx.closePath()
    }
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'destination-out'
    path()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = '#2dd4bf'
    ctx.lineWidth = 2
    path()
    ctx.stroke()
  }

  function place() {
    const rect = canvas.getBoundingClientRect()
    for (const { key, el } of handles) {
      const p = quad[key]
      el.style.left = `${(p.x / canvas.width) * rect.width}px`
      el.style.top = `${(p.y / canvas.height) * rect.height}px`
    }
    drawMask(rect)
  }

  let active: typeof CORNER_KEYS[number] | null = null
  function onDown(e: PointerEvent) {
    const key = (e.target as HTMLElement).dataset?.key as typeof active
    if (key) { active = key; e.preventDefault() }
  }
  function onMove(e: PointerEvent) {
    if (!active) return
    const rect = canvas.getBoundingClientRect()
    quad[active] = clientToImage(e.clientX, e.clientY, rect, canvas.width, canvas.height)
    place()
    onChange?.(quad)
  }
  function onUp() { active = null }

  container.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('resize', place)
  place()
  requestAnimationFrame(place)

  return {
    getQuad: () => JSON.parse(JSON.stringify(quad)),
    destroy() {
      container.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('resize', place)
    },
  }
}
