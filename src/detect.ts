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
  resize: (src: CvMat, dst: CvMat, dsize: unknown) => void
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void
  GaussianBlur: (src: CvMat, dst: CvMat, ksize: unknown, sigmaX: number) => void
  Canny: (src: CvMat, dst: CvMat, t1: number, t2: number) => void
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat) => void
  getStructuringElement: (shape: number, ksize: unknown) => CvMat
  findContours: (img: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number) => void
  contourArea: (c: CvMat) => number
  arcLength: (c: CvMat, closed: boolean) => number
  approxPolyDP: (curve: CvMat, approx: CvMat, epsilon: number, closed: boolean) => void
  isContourConvex: (c: CvMat) => boolean
  COLOR_RGBA2GRAY: number
  MORPH_RECT: number
  RETR_EXTERNAL: number
  CHAIN_APPROX_SIMPLE: number
}

/**
 * Findet die Dokument-Ecken per OpenCV-Kontursuche (robuster als jscanifys
 * "groesste Kontur", die auf echten Fotos oft das ganze Bild/den Tisch nimmt):
 * verkleinern -> Graustufen -> Blur -> Canny-Kanten -> dilatieren -> Konturen.
 * Aus den Konturen das flaechengroesste KONVEXE Viereck waehlen, dessen Flaeche
 * zwischen 15% und 98% des Bildes liegt (98%-Deckel verwirft den Vollbild-Rahmen).
 * Kein Treffer -> fullFrameQuad (Nutzer zieht dann manuell).
 */
export async function detectQuad(canvas: HTMLCanvasElement): Promise<Quad> {
  await loadOpenCv()
  const cv = window.cv as unknown as CvDetect
  const mats: { delete: () => void }[] = []
  const track = <T extends { delete: () => void }>(m: T): T => { mats.push(m); return m }
  try {
    const src = track(cv.imread(canvas))
    const maxDim = 900
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height))
    const w = Math.max(1, Math.round(canvas.width * scale))
    const h = Math.max(1, Math.round(canvas.height * scale))
    const work = track(new cv.Mat())
    cv.resize(src, work, new cv.Size(w, h))

    const gray = track(new cv.Mat())
    cv.cvtColor(work, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0)
    const edges = track(new cv.Mat())
    cv.Canny(gray, edges, 50, 150)
    const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)))
    cv.dilate(edges, edges, kernel) // Kanten schliessen, damit die Kontur rundlaeuft

    const contours = track(new cv.MatVector())
    const hierarchy = track(new cv.Mat())
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)

    const imgArea = w * h
    const epsFactors = [0.02, 0.03, 0.04, 0.05]
    let bestPts: Point[] | null = null
    let bestArea = 0
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i)
      const area = cv.contourArea(c)
      if (area < imgArea * 0.15 || area > imgArea * 0.98 || area <= bestArea) { c.delete(); continue }
      const peri = cv.arcLength(c, true)
      for (const f of epsFactors) {
        const approx = track(new cv.Mat())
        cv.approxPolyDP(c, approx, f * peri, true)
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          bestPts = [0, 1, 2, 3].map(j => ({ x: approx.data32S[j * 2] / scale, y: approx.data32S[j * 2 + 1] / scale }))
          bestArea = area
          break
        }
      }
      c.delete()
    }
    return bestPts ? orderCorners(bestPts) : fullFrameQuad(canvas.width, canvas.height)
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
