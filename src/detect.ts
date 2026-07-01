import type { Point, Quad } from './types'

/** Ordnet 4 Punkte: topLeft = min(x+y), bottomRight = max(x+y), topRight = min(y-x), bottomLeft = max(y-x). */
export function orderCorners(points: Point[]): Quad {
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...points].sort((a, b) => (a.y - a.x) - (b.y - b.x))
  return {
    topLeft: bySum[0],
    bottomRight: bySum[bySum.length - 1],
    topRight: byDiff[0],
    bottomLeft: byDiff[byDiff.length - 1],
  }
}

export function fullFrameQuad(w: number, h: number): Quad {
  return {
    topLeft: { x: 0, y: 0 },
    topRight: { x: w, y: 0 },
    bottomRight: { x: w, y: h },
    bottomLeft: { x: 0, y: h },
  }
}

// --- jscanify/OpenCV Wrapper -----------------------------------------------
//
// jscanify's npm "main" entry (src/jscanify-node.js) is a Node.js build that
// requires the "canvas"/"jsdom" packages and is unusable in a Vite/browser
// bundle. The browser build lives under the "./client" subpath export
// (src/jscanify.js, verified in node_modules/jscanify/package.json:
// "exports": { ".": ".../jscanify-node.js", "./client": ".../jscanify.js" }).
// It's a UMD bundle with no bundled types, so we import it via "jscanify/client"
// and type it locally.
//
// Verified real API of src/jscanify.js (v1.4.0):
//   - `new jscanify()` (default export IS the class, no named export)
//   - findPaperContour(mat: cv.Mat): cv.Mat | null — reads the paper contour
//     from an already-loaded OpenCV Mat (NOT an HTMLImageElement/canvas).
//   - getCornerPoints(contour): { topLeftCorner, topRightCorner,
//     bottomLeftCorner, bottomRightCorner } — each `{ x, y }` or `undefined`
//     if a corner couldn't be classified. Takes only the contour (single arg).
//   - extractPaper(image: HTMLImageElement | HTMLCanvasElement, resultWidth,
//     resultHeight, cornerPoints?): HTMLCanvasElement | null — takes the
//     ORIGINAL image/canvas directly (calls cv.imread(image) internally), not
//     a Mat. Returns null if no contour is found and no cornerPoints given.
//   - Reads the OpenCV global `cv` directly (not via a `scanner.cv` property).
import jscanify from 'jscanify/client'

declare global {
  interface Window {
    cv?: { onRuntimeInitialized?: () => void; Mat?: unknown; imread?: (img: unknown) => unknown }
  }
}

interface JscanifyCornerPoints {
  topLeftCorner?: Point
  topRightCorner?: Point
  bottomLeftCorner?: Point
  bottomRightCorner?: Point
}

interface JscanifyScanner {
  findPaperContour(mat: unknown): unknown | null
  getCornerPoints(contour: unknown): JscanifyCornerPoints
  extractPaper(
    image: HTMLCanvasElement | HTMLImageElement,
    resultWidth: number,
    resultHeight: number,
    cornerPoints?: {
      topLeftCorner: Point
      topRightCorner: Point
      bottomLeftCorner: Point
      bottomRightCorner: Point
    },
  ): HTMLCanvasElement | null
}

type JscanifyCtor = new () => JscanifyScanner
const Jscanify = jscanify as unknown as JscanifyCtor

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js'

export function loadOpenCv(): Promise<void> {
  if (window.cv?.Mat) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = OPENCV_URL
    s.async = true
    s.onload = () => {
      // OpenCV meldet Bereitschaft asynchron
      const cv = window.cv
      if (cv?.Mat) resolve()
      else if (cv) cv.onRuntimeInitialized = () => resolve()
      else reject(new Error('OpenCV.js konnte nicht geladen werden'))
    }
    s.onerror = () => reject(new Error('OpenCV.js konnte nicht geladen werden'))
    document.head.appendChild(s)
  })
}

export async function detectQuad(canvas: HTMLCanvasElement): Promise<Quad> {
  try {
    await loadOpenCv()
    const cv = window.cv as { imread: (c: HTMLCanvasElement) => { delete: () => void } }
    const scanner = new Jscanify()
    const mat = cv.imread(canvas)
    try {
      const contour = scanner.findPaperContour(mat)
      if (!contour) return fullFrameQuad(canvas.width, canvas.height)
      const c = scanner.getCornerPoints(contour)
      const pts = [c.topLeftCorner, c.topRightCorner, c.bottomRightCorner, c.bottomLeftCorner]
      if (pts.some(p => !p)) return fullFrameQuad(canvas.width, canvas.height)
      return orderCorners(pts as Point[])
    } finally {
      mat.delete()
    }
  } catch {
    return fullFrameQuad(canvas.width, canvas.height)
  }
}

export function warp(canvas: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const scanner = new Jscanify()
  const width = Math.round(
    Math.max(dist(quad.topLeft, quad.topRight), dist(quad.bottomLeft, quad.bottomRight)),
  )
  const height = Math.round(
    Math.max(dist(quad.topLeft, quad.bottomLeft), dist(quad.topRight, quad.bottomRight)),
  )
  const cornerPoints = {
    topLeftCorner: quad.topLeft,
    topRightCorner: quad.topRight,
    bottomRightCorner: quad.bottomRight,
    bottomLeftCorner: quad.bottomLeft,
  }
  const result = scanner.extractPaper(canvas, width, height, cornerPoints)
  return result ?? canvas
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
