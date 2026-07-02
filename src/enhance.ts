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

interface Mat {
  delete: () => void
  rows: number
  cols: number
  data: Uint8Array
  data32F: Float32Array
  data64F: Float64Array
}
interface MatVector { size: () => number; get: (i: number) => Mat; push_back: (m: Mat) => void; delete: () => void }
interface MatStatic {
  new (): Mat
  new (rows: number, cols: number, type: number): Mat
  zeros: (rows: number, cols: number, type: number) => Mat
}
interface Cv {
  Mat: MatStatic
  MatVector: new () => MatVector
  Size: new (w: number, h: number) => unknown
  Point: new (x: number, y: number) => unknown
  imread: (c: HTMLCanvasElement) => Mat
  imshow: (c: HTMLCanvasElement, m: Mat) => void
  cvtColor: (src: Mat, dst: Mat, code: number) => void
  divide: (src1: Mat, src2: Mat, dst: Mat, scale: number) => void
  getStructuringElement: (shape: number, ksize: unknown) => Mat
  morphologyEx: (src: Mat, dst: Mat, op: number, kernel: Mat) => void
  filter2D: (src: Mat, dst: Mat, ddepth: number, kernel: Mat, anchor: unknown, delta: number, borderType: number) => void
  bitwise_not: (src: Mat, dst: Mat) => void
  calcHist: (images: MatVector, channels: number[], mask: Mat, hist: Mat, histSize: number[], ranges: number[]) => void
  LUT: (src: Mat, lut: Mat, dst: Mat) => void
  merge: (mv: MatVector, dst: Mat) => void
  split: (src: Mat, mv: MatVector) => void
  getGaussianKernel: (ksize: number, sigma: number) => Mat
  sepFilter2D: (src: Mat, dst: Mat, ddepth: number, kx: Mat, ky: Mat) => void
  COLOR_RGBA2GRAY: number
  COLOR_RGBA2RGB: number
  MORPH_ELLIPSE: number
  MORPH_CLOSE: number
  CV_8U: number
  CV_64F: number
  BORDER_DEFAULT: number
}

function getCv(): Cv | null {
  const cv = (window as unknown as { cv?: Cv }).cv
  return cv && cv.Mat ? cv : null
}

function oddClamp(v: number, lo: number, hi: number): number {
  const r = Math.round(v)
  const odd = r % 2 === 0 ? r + 1 : r
  return Math.min(hi, Math.max(lo, odd))
}

// --- Whitepaper-Filter, portiert aus OSS-DocumentScanner WhitePaperTransform.cpp ---

/** Zero-normalisiert den DoG-Kernel: Positiv-Anteil auf Summe scalingFactor, Negativ unveraendert. */
function normalizeKernel(data: Float64Array, n: number, scalingFactor: number): void {
  const EPS = 1e-12
  let pos = 0, neg = 0
  for (let i = 0; i < n; i++) {
    if (Math.abs(data[i]) < EPS) data[i] = 0
    if (data[i] < 0) neg += data[i]; else pos += data[i]
  }
  let posScale = Math.abs(pos) >= EPS ? pos : 1.0
  let negScale = Math.abs(neg) >= EPS ? 1.0 : -neg
  posScale = scalingFactor / posScale
  negScale = scalingFactor / negScale
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(data[i])) data[i] *= data[i] >= 0 ? posScale : negScale
  }
}

/** Difference-of-Gaussian-Kernel (High-Pass): entfernt niederfrequente Beleuchtung/Schatten. */
function dogKernel(cv: Cv, kSize: number, sigma1: number, sigma2: number): Mat {
  const k = cv.Mat.zeros(kSize, kSize, cv.CV_64F)
  const data = k.data64F
  const x = (kSize - 1) / 2, y = (kSize - 1) / 2
  let i = 0
  if (sigma1 > 0) {
    const co1 = 1 / (2 * sigma1 * sigma1), co2 = 1 / (2 * Math.PI * sigma1 * sigma1)
    for (let v = -y; v <= y; v++) for (let u = -x; u <= x; u++) data[i++] = Math.exp(-(u * u + v * v) * co1) * co2
  } else {
    data[x + y * kSize] = 1.0
  }
  i = 0
  if (sigma2 > 0) {
    const co1 = 1 / (2 * sigma2 * sigma2), co2 = 1 / (2 * Math.PI * sigma2 * sigma2)
    for (let v = -y; v <= y; v++) for (let u = -x; u <= x; u++) data[i++] -= Math.exp(-(u * u + v * v) * co1) * co2
  } else {
    data[x + y * kSize] -= 1.0
  }
  normalizeKernel(data, kSize * kSize, 1.0)
  return k
}

function channelHist(cv: Cv, ch: Mat): Float32Array {
  const images = new cv.MatVector(); images.push_back(ch)
  const hist = new cv.Mat(); const mask = new cv.Mat()
  cv.calcHist(images, [0], mask, hist, [256], [0, 256])
  const out = Float32Array.from(hist.data32F)
  images.delete(); hist.delete(); mask.delete()
  return out
}

function lutFromArray(cv: Cv, values: Uint8Array): Mat {
  const lut = new cv.Mat(1, 256, cv.CV_8U)
  lut.data.set(values)
  return lut
}

/** Zerlegt in Kanaele, baut je Kanal aus dem Histogramm eine LUT und fuehrt wieder zusammen (in-place). */
function applyPerChannelLut(cv: Cv, mat: Mat, buildLut: (hist: Float32Array) => Uint8Array): void {
  const channels = new cv.MatVector(); cv.split(mat, channels)
  const out = new cv.MatVector()
  const n = Math.min(channels.size(), 3)
  for (let ci = 0; ci < n; ci++) {
    const ch = channels.get(ci)
    const lut = lutFromArray(cv, buildLut(channelHist(cv, ch)))
    const dst = new cv.Mat()
    cv.LUT(ch, lut, dst)
    out.push_back(dst)
    dst.delete(); lut.delete()
  }
  cv.merge(out, mat)
  channels.delete(); out.delete()
}

/** Perzentil-Kontrast-Streckung (Schwarz-/Weisspunkt aus kumuliertem Histogramm). */
function stretchLut(hist: Float32Array, totCount: number, blackCount: number, whiteCount: number): Uint8Array {
  let blackInd = 0, co = 0
  for (let i = 0; i < 256; i++) { co += hist[i]; if (co > blackCount) { blackInd = i; break } }
  let whiteInd = 255; co = 0
  for (let i = 255; i >= 0; i--) { co += hist[i]; if (co > (totCount - whiteCount)) { whiteInd = i; break } }
  const lut = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    if (i < blackInd) lut[i] = 0
    else if (i > whiteInd) lut[i] = 255
    else if (whiteInd - blackInd > 0) lut[i] = Math.round((i - blackInd) / (whiteInd - blackInd) * 255)
    else lut[i] = 0
  }
  return lut
}

/** Color-Balance: wie stretchLut, aber Grenzen aus kumulierter Summe von unten/oben. */
function balanceLut(hist: Float32Array, lowCount: number, highCount: number): Uint8Array {
  let li = 0, sum = 0
  for (let i = 0; i < 256; i++) { sum += hist[i]; if (sum >= lowCount) { li = i; break } }
  let hi = 255; sum = 0
  for (let i = 255; i >= 0; i--) { sum += hist[i]; if (sum >= highCount) { hi = i; break } }
  const lut = new Uint8Array(256)
  if (li === hi) { for (let i = 0; i < 256; i++) lut[i] = i; return lut }
  for (let i = 0; i < 256; i++) {
    if (i < li) lut[i] = 0
    else if (i > hi) lut[i] = 255
    else if (hi - li > 0) lut[i] = Math.round((i - li) / (hi - li) * 255)
    else lut[i] = 0
  }
  return lut
}

/**
 * "Whitepaper"-Scan-Look, portiert aus OSS-DocumentScanner (whiteboardEnhance):
 * DoG-High-Pass (entfernt Schatten/Beleuchtung) -> Negativ -> Perzentil-Kontrast-
 * Streckung -> leichte Gaussweichzeichnung -> Gamma -> Color-Balance. Ergibt einen
 * sauberen weissen Hintergrund mit kraeftigem Text, Farbe bleibt erhalten.
 * Defaults 1:1 aus WhitePaperTransform.h. Ohne OpenCV Fallback auf Kontrast-Streckung.
 */
export function documentEnhance(canvas: HTMLCanvasElement): void {
  const cv = getCv()
  if (!cv) { enhanceCanvas(canvas); return }
  const mats: Mat[] = []
  const track = <T extends Mat>(m: T): T => { mats.push(m); return m }
  try {
    const src = track(cv.imread(canvas))
    const dst = track(new cv.Mat())
    cv.cvtColor(src, dst, cv.COLOR_RGBA2RGB)

    // 1) DoG-High-Pass (kSize 15, sigma1 100, sigma2 0)
    const kernel = track(dogKernel(cv, 15, 100, 0))
    cv.filter2D(dst, dst, -1, kernel, new cv.Point(-1, -1), 0, cv.BORDER_DEFAULT)
    // 2) Negativ
    cv.bitwise_not(dst, dst)
    // 3) Kontrast-Streckung (csBlackPer 2, csWhitePer 99.5)
    const tot = dst.rows * dst.cols
    applyPerChannelLut(cv, dst, h => stretchLut(h, tot, tot * 2 / 100, tot * 99.5 / 100))
    // 4) leichte Gaussweichzeichnung (kSize 3, sigma 1)
    const kx = track(cv.getGaussianKernel(3, 1.0))
    cv.sepFilter2D(dst, dst, -1, kx, kx)
    // 5) Gamma (1.1)
    const g = 1.1, ig = 1 / g
    const gl = new Uint8Array(256)
    for (let i = 0; i < 256; i++) gl[i] = Math.round(Math.pow(i / 255, ig) * 255)
    const glut = track(lutFromArray(cv, gl))
    cv.LUT(dst, glut, dst)
    // 6) Color-Balance (cbBlackPer 2, cbWhitePer 1)
    applyPerChannelLut(cv, dst, h => balanceLut(h, tot * 2 / 100, tot * (100 - 1) / 100))

    cv.imshow(canvas, dst)
  } catch {
    enhanceCanvas(canvas)
  } finally {
    mats.forEach(m => m?.delete())
  }
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
  const cv = getCv()
  if (!cv) { enhanceCanvas(canvas); return }
  const mats: Mat[] = []
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
