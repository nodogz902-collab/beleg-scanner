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

export function isFullFrame(quad: Quad, width: number, height: number): boolean {
  const f = fullFrameQuad(width, height)
  const eq = (a: Point, b: Point) => a.x === b.x && a.y === b.y
  return eq(quad.topLeft, f.topLeft) && eq(quad.topRight, f.topRight)
    && eq(quad.bottomRight, f.bottomRight) && eq(quad.bottomLeft, f.bottomLeft)
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

const OPENCV_URL = 'https://docs.opencv.org/4.9.0/opencv.js'
let openCvPromise: Promise<void> | null = null

export function loadOpenCv(): Promise<void> {
  if (window.cv?.Mat) return Promise.resolve()
  if (openCvPromise) return openCvPromise

  openCvPromise = new Promise<void>((resolve, reject) => {
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
    s.onerror = () => {
      openCvPromise = null
      reject(new Error('OpenCV.js konnte nicht geladen werden'))
    }
    document.head.appendChild(s)
  }).catch((err) => {
    openCvPromise = null
    throw err
  })

  return openCvPromise
}

interface CvMat { delete: () => void; rows: number; cols: number; data32S: Int32Array }
interface CvMatVector { size: () => number; get: (i: number) => CvMat; delete: () => void }
interface CvDetect {
  imread: (c: HTMLCanvasElement) => CvMat
  Mat: new () => CvMat
  MatVector: new () => CvMatVector
  Size: new (w: number, h: number) => unknown
  Scalar: new (a: number, b: number, c: number, d: number) => unknown
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void
  resize: (src: CvMat, dst: CvMat, dsize: unknown) => void
  copyMakeBorder: (src: CvMat, dst: CvMat, t: number, b: number, l: number, r: number, type: number, value: unknown) => void
  medianBlur: (src: CvMat, dst: CvMat, ksize: number) => void
  split: (src: CvMat, channels: CvMatVector) => void
  threshold: (src: CvMat, dst: CvMat, thresh: number, maxval: number, type: number) => number
  morphologyEx: (src: CvMat, dst: CvMat, op: number, kernel: CvMat) => void
  Canny: (src: CvMat, dst: CvMat, t1: number, t2: number) => void
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void
  getStructuringElement: (shape: number, ksize: unknown) => CvMat
  findContours: (img: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number) => void
  contourArea: (c: CvMat) => number
  arcLength: (c: CvMat, closed: boolean) => number
  approxPolyDP: (curve: CvMat, approx: CvMat, epsilon: number, closed: boolean) => void
  isContourConvex: (c: CvMat) => boolean
  MORPH_RECT: number
  MORPH_CLOSE: number
  RETR_TREE: number
  CHAIN_APPROX_SIMPLE: number
  THRESH_BINARY: number
  BORDER_CONSTANT: number
  COLOR_RGBA2RGB: number
}

// Portiert aus OSS-DocumentScanner (Akylas) DocumentDetector.cpp — Defaults 1:1.
const DETECT = {
  resizeThreshold: 500,
  borderSize: 10,
  cannyFactor: 2,
  morphologyAnchorSize: 4,
  dilateAnchorSize: 3,
  thresh: 160,
  threshMax: 256,
  medianBlurValue: 9,
  contoursApproxEpsilonFactor: 0.02,
  expectedMaxCosine: 0.4,
  expectedOptimalMaxCosine: 0.3,
  expectedAreaFactor: 0.20,
  areaScaleMinFactor: 0.04,
  minDistanceFromBorderFactor: 0,
}

interface Square { pts: Point[]; area: number; maxCos: number; weight: number }
const squareScore = (s: Square) => s.area + s.weight * (1 - s.maxCos)

/** Cosinus des Winkels am Scheitel pt0 zwischen pt0->pt1 und pt0->pt2. */
function angleCos(pt1: Point, pt2: Point, pt0: Point): number {
  const dx1 = pt1.x - pt0.x, dy1 = pt1.y - pt0.y
  const dx2 = pt2.x - pt0.x, dy2 = pt2.y - pt0.y
  return (dx1 * dx2 + dy1 * dy2) / Math.sqrt((dx1 * dx1 + dy1 * dy1) * (dx2 * dx2 + dy2 * dy2) + 1e-10)
}

/** Sucht konvexe 4-Ecke in der Kanten-Maske edged (w×h inkl. Rand); Rand-nahe und schiefe verwirft. */
function findSquares(cv: CvDetect, edged: CvMat, w: number, h: number, weight: number, out: Square[]): void {
  const marge = w * DETECT.minDistanceFromBorderFactor + DETECT.borderSize
  const maxAllowedArea = (w - 2 * DETECT.borderSize) * (h - 2 * DETECT.borderSize) * 0.92
  const minArea = w * h * DETECT.areaScaleMinFactor
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  cv.findContours(edged, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE)
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i)
    const arc = cv.arcLength(c, true)
    const area = cv.contourArea(c)
    if (arc < 100 || area < minArea || area >= maxAllowedArea) { c.delete(); continue }
    const approx = new cv.Mat()
    cv.approxPolyDP(c, approx, arc * DETECT.contoursApproxEpsilonFactor, true)
    if (approx.rows === 4 && cv.isContourConvex(approx)) {
      const d = approx.data32S
      const pts: Point[] = [0, 1, 2, 3].map(k => ({ x: d[k * 2], y: d[k * 2 + 1] }))
      let ignore = false
      for (const p of pts) { if (p.x < marge || p.x >= w - marge || p.y < marge || p.y >= h - marge) { ignore = true; break } }
      if (!ignore) {
        let maxCos = 0
        for (let j = 2; j < 6; j++) {
          const cos = Math.abs(angleCos(pts[j % 4], pts[j - 2], pts[(j - 1) % 4]))
          if (cos > maxCos) maxCos = cos
        }
        if (maxCos < DETECT.expectedMaxCosine) out.push({ pts, area, maxCos, weight })
      }
    }
    approx.delete(); c.delete()
  }
  contours.delete(); hierarchy.delete()
}

/**
 * Dokument-Erkennung, portiert aus OSS-DocumentScanner (Akylas): auf ~500px
 * verkleinern, schwarzen Rand (10px) hinzufuegen (Dokumente am Bildrand schliessen
 * sich, und der Vollbild-/Tisch-Rahmen wird durch die Rand-Verwerfung eliminiert),
 * medianBlur, dann pro Farbkanal Threshold + mehrere Canny-Stufen -> morph/dilate ->
 * konvexe 4-Ecke mit ~90°-Ecken (Cosinus-Check) sammeln und das bestbewertete
 * (Flaeche + Gewicht·Rechtwinkligkeit) waehlen. Kein Treffer -> fullFrameQuad.
 */
export async function detectQuad(canvas: HTMLCanvasElement): Promise<Quad> {
  await loadOpenCv()
  const cv = window.cv as unknown as CvDetect
  const mats: { delete: () => void }[] = []
  const track = <T extends { delete: () => void }>(m: T): T => { mats.push(m); return m }
  try {
    const src = track(cv.imread(canvas))
    // RGBA -> RGB: medianBlur mit grosser Blende unterstuetzt nur 1/3-Kanal.
    const rgb = track(new cv.Mat())
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB)
    const maxSide = Math.max(canvas.width, canvas.height)
    let resizeScale = 1
    let rw = canvas.width, rh = canvas.height
    if (maxSide > DETECT.resizeThreshold) {
      resizeScale = maxSide / DETECT.resizeThreshold
      rw = Math.floor(canvas.width / resizeScale)
      rh = Math.floor(canvas.height / resizeScale)
    }
    const resized = track(new cv.Mat())
    cv.resize(rgb, resized, new cv.Size(rw, rh))
    const bordered = track(new cv.Mat())
    const b = DETECT.borderSize
    cv.copyMakeBorder(resized, bordered, b, b, b, b, cv.BORDER_CONSTANT, new cv.Scalar(0, 0, 0, 255))
    const w = rw + 2 * b, h = rh + 2 * b
    const imgArea = w * h

    const blurred = track(new cv.Mat())
    cv.medianBlur(bordered, blurred, DETECT.medianBlurValue)

    const morph = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(DETECT.morphologyAnchorSize, DETECT.morphologyAnchorSize)))
    const dil = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(DETECT.dilateAnchorSize, DETECT.dilateAnchorSize)))
    const edged = track(new cv.Mat())
    // extractChannel gibt es in OpenCV.js nicht -> einmal split, dann Kanaele nutzen.
    const channels = track(new cv.MatVector())
    cv.split(blurred, channels)

    const squares: Square[] = []
    let weight = 3000000
    const goodEnough = () => {
      if (!squares.length) return false
      squares.sort((a, z) => squareScore(z) - squareScore(a))
      const best = squares[0]
      return best.maxCos < DETECT.expectedOptimalMaxCosine && best.area > imgArea * DETECT.expectedAreaFactor
    }

    let done = false
    for (let i = 2; i >= 0 && !done; i--) {
      const chan = channels.get(i)
      cv.threshold(chan, edged, DETECT.thresh, DETECT.threshMax, cv.THRESH_BINARY)
      cv.morphologyEx(edged, edged, cv.MORPH_CLOSE, morph)
      cv.dilate(edged, edged, dil)
      findSquares(cv, edged, w, h, weight--, squares)
      if (goodEnough()) { done = true; break }
      for (let t = 60; t >= 10 && !done; t -= 10) {
        cv.Canny(chan, edged, t * DETECT.cannyFactor, DETECT.cannyFactor * t * 2)
        cv.dilate(edged, edged, dil)
        findSquares(cv, edged, w, h, weight--, squares)
        if (goodEnough()) done = true
      }
    }

    if (!squares.length) return fullFrameQuad(canvas.width, canvas.height)
    squares.sort((a, z) => squareScore(z) - squareScore(a))
    const pts = squares[0].pts.map(p => ({ x: (p.x - b) * resizeScale, y: (p.y - b) * resizeScale }))
    return orderCorners(pts)
  } catch {
    return fullFrameQuad(canvas.width, canvas.height)
  } finally {
    mats.forEach(m => m.delete())
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
  try {
    const result = scanner.extractPaper(canvas, width, height, cornerPoints)
    return result ?? canvas
  } catch {
    return canvas
  }
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
