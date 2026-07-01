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

  const handles = CORNER_KEYS.map(key => {
    const el = document.createElement('div')
    el.className = 'corner-handle'
    el.dataset.key = key
    container.appendChild(el)
    return { key, el }
  })

  function place() {
    const rect = canvas.getBoundingClientRect()
    for (const { key, el } of handles) {
      const p = quad[key]
      el.style.left = `${(p.x / canvas.width) * rect.width}px`
      el.style.top = `${(p.y / canvas.height) * rect.height}px`
    }
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
