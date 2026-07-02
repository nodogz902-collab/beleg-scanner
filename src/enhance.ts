/** Lineare Kontrast-Streckung über alle RGB-Kanäle, in-place. Alpha bleibt. */
export function autoContrast(data: Uint8ClampedArray): void {
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c]
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  const range = max - min
  if (range === 0) return
  const scale = 255 / range
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      data[i + c] = Math.round((data[i + c] - min) * scale)
    }
  }
}

/** Wendet autoContrast auf ein Canvas an (Browser). */
export function enhanceCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  autoContrast(img.data)
  ctx.putImageData(img, 0, 0)
}

interface Mat { delete: () => void }
interface CvLike {
  Mat: new () => Mat
  Size: new (w: number, h: number) => unknown
  imread: (c: HTMLCanvasElement) => Mat
  imshow: (c: HTMLCanvasElement, m: unknown) => void
  cvtColor: (src: unknown, dst: unknown, code: number) => void
  divide: (src1: unknown, src2: unknown, dst: unknown, scale: number) => void
  getStructuringElement: (shape: number, ksize: unknown) => Mat
  morphologyEx: (src: unknown, dst: unknown, op: number, kernel: unknown) => void
  COLOR_RGBA2GRAY: number
  MORPH_ELLIPSE: number
  MORPH_CLOSE: number
}

function oddClamp(v: number, lo: number, hi: number): number {
  const r = Math.round(v)
  const odd = r % 2 === 0 ? r + 1 : r
  return Math.min(hi, Math.max(lo, odd))
}

/**
 * Entschattetes Graustufenbild fuer die OCR (NICHT fuer die Anzeige — die bleibt
 * ein Foto). Kernidee gegen Schatten/ungleichmaessiges Licht auf Handyfotos:
 *  1. Graustufen.
 *  2. Beleuchtung/Schatten schaetzen: morphologisches Close mit grossem Kernel
 *     (loescht den Text weg -> uebrig bleibt der Papier-Hintergrund inkl. Verlauf).
 *  3. Flat-Field: gray / background * 255 -> gleichmaessig ausgeleuchtet, weisser
 *     Hintergrund, Schatten weg. Tesseract liest das deutlich zuverlaessiger als
 *     das rohe/nur kontrastierte Foto (real: 2,40 -> 21,40, Lieferant korrekt).
 * Ohne OpenCV Fallback auf lineare Kontrast-Streckung. Mutiert das Canvas in-place.
 */
export function documentGray(canvas: HTMLCanvasElement): void {
  const cv = (window as unknown as { cv?: CvLike }).cv
  if (!cv?.Mat) { enhanceCanvas(canvas); return }
  const mats: (Mat | null)[] = []
  const track = <T extends Mat>(m: T): T => { mats.push(m); return m }
  try {
    const src = track(cv.imread(canvas))
    const gray = track(new cv.Mat())
    const bg = track(new cv.Mat())
    const norm = track(new cv.Mat())
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)

    const dim = Math.min(canvas.width, canvas.height)
    // Kernel groesser als Zeichenhoehe, damit der Text im Hintergrund verschwindet.
    const k = oddClamp(dim / 15, 21, 81)
    const kernel = track(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)))
    cv.morphologyEx(gray, bg, cv.MORPH_CLOSE, kernel)
    cv.divide(gray, bg, norm, 255)
    cv.imshow(canvas, norm)
  } catch {
    enhanceCanvas(canvas)
  } finally {
    mats.forEach(m => m?.delete())
  }
}
