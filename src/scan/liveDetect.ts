import type { Quad, Point } from '../types'
import { detectQuad } from '../detect'

const CORNERS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const

export function quadAreaRatio(quad: Quad, w: number, h: number): number {
  const pts: Point[] = CORNERS.map(k => quad[k])
  let area = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2 / (w * h)
}

export function isStableQuad(history: Quad[], maxJitterPx: number): boolean {
  if (history.length < 3) return false
  const recent = history.slice(-3)
  for (const k of CORNERS) {
    const xs = recent.map(q => q[k].x), ys = recent.map(q => q[k].y)
    if (Math.max(...xs) - Math.min(...xs) > maxJitterPx) return false
    if (Math.max(...ys) - Math.min(...ys) > maxJitterPx) return false
  }
  return true
}

export function startLiveDetect(
  video: HTMLVideoElement,
  work: HTMLCanvasElement,
  opts: { minAreaRatio?: number; maxJitterPx?: number; intervalMs?: number; onQuad?: (q: Quad) => void; onStable: (q: Quad) => void },
): () => void {
  const minArea = opts.minAreaRatio ?? 0.25
  const jitter = opts.maxJitterPx ?? 12
  const interval = opts.intervalMs ?? 150
  let stopped = false
  let last = 0
  let history: Quad[] = []
  async function tick(ts: number) {
    if (stopped) return
    if (ts - last >= interval && video.videoWidth) {
      last = ts
      const scale = 640 / Math.max(video.videoWidth, video.videoHeight)
      work.width = Math.round(video.videoWidth * scale)
      work.height = Math.round(video.videoHeight * scale)
      work.getContext('2d')!.drawImage(video, 0, 0, work.width, work.height)
      const quad = await detectQuad(work)
      opts.onQuad?.(quad)
      history = [...history, quad].slice(-3)
      if (quadAreaRatio(quad, work.width, work.height) >= minArea && isStableQuad(history, jitter)) {
        opts.onStable(quad); stopped = true; return
      }
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return () => { stopped = true }
}
