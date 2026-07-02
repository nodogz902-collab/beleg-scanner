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
  medianBlur: (src: unknown, dst: unknown, ksize: number) => void
  GaussianBlur: (src: unknown, dst: unknown, ksize: unknown, sigmaX: number) => void
  getStructuringElement: (shape: number, ksize: unknown) => Mat
  morphologyEx: (src: unknown, dst: unknown, op: number, kernel: unknown) => void
  threshold: (src: unknown, dst: unknown, thresh: number, maxval: number, type: number) => void
  COLOR_RGBA2GRAY: number
  MORPH_ELLIPSE: number
  MORPH_CLOSE: number
  THRESH_BINARY: number
  THRESH_OTSU: number
}

function oddClamp(v: number, lo: number, hi: number): number {
  const r = Math.round(v)
  const odd = r % 2 === 0 ? r + 1 : r
  return Math.min(hi, Math.max(lo, odd))
}

/**
 * Gemeinsame Scan-Aufbereitung des (bereits zugeschnittenen) Fotos. Kernidee
 * gegen Schatten/Rauschen auf echten Handyfotos:
 *  1. Graustufen.
 *  2. Beleuchtung/Schatten schaetzen: morphologisches Close mit grossem Kernel
 *     (loescht den Text weg -> uebrig bleibt der Papier-Hintergrund inkl. Verlauf).
 *  3. Flat-Field: gray / background * 255 -> gleichmaessig ausgeleuchtet, weisser
 *     Hintergrund, Schatten weg.
 * `binarize=false` liefert dieses saubere Graustufenbild (ideal fuer OCR).
 * `binarize=true` legt fuer den PDF-Look zusaetzlich einen globalen Otsu-Threshold
 * drauf: nach dem Flat-Field ist die Beleuchtung gleichmaessig, daher trifft ein
 * globaler Schwellwert -> leere Flaechen bleiben komplett weiss (kein Speckle,
 * anders als bei adaptivem Threshold auf verrauschtem Papier).
 * Ohne OpenCV Fallback auf lineare Kontrast-Streckung. Mutiert das Canvas in-place.
 */
function scanPipeline(canvas: HTMLCanvasElement, binarize: boolean): void {
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

    if (!binarize) { cv.imshow(canvas, norm); return }

    cv.GaussianBlur(norm, norm, new cv.Size(3, 3), 0) // Rauschen glaetten vor Otsu
    const dst = track(new cv.Mat())
    cv.threshold(norm, dst, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU)
    cv.medianBlur(dst, dst, 3) // Rest-Speckle entfernen
    cv.imshow(canvas, dst)
  } catch {
    enhanceCanvas(canvas)
  } finally {
    mats.forEach(m => m?.delete())
  }
}

/** Schwarz-Weiss-Scan (PDF-Look) fuer Anzeige + PDF. */
export function documentScan(canvas: HTMLCanvasElement): void {
  scanPipeline(canvas, true)
}

/** Entschattetes Graustufenbild fuer die OCR (gleichmaessige Beleuchtung, keine Binarisierungs-Artefakte). */
export function documentGray(canvas: HTMLCanvasElement): void {
  scanPipeline(canvas, false)
}
