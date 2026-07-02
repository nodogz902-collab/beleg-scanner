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

interface CvLike {
  Mat: new () => unknown
  imread: (c: HTMLCanvasElement) => { delete: () => void }
  imshow: (c: HTMLCanvasElement, m: unknown) => void
  cvtColor: (src: unknown, dst: unknown, code: number) => void
  adaptiveThreshold: (src: unknown, dst: unknown, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number) => void
  COLOR_RGBA2GRAY: number
  ADAPTIVE_THRESH_GAUSSIAN_C: number
  THRESH_BINARY: number
}

/**
 * Macht aus dem (bereits zugeschnittenen) Foto einen Schwarz-Weiss-Scan wie ein
 * echtes PDF: Graustufen + adaptive Binarisierung (weisser Hintergrund, schwarze
 * Schrift, robust gegen ungleichmaessiges Licht/Schatten). Nutzt das bereits fuer
 * die Erkennung geladene OpenCV; faellt ohne OpenCV auf lineare Kontrast-Streckung
 * zurueck, damit der Pfad nie bricht. Mutiert das Canvas in-place.
 */
export function documentScan(canvas: HTMLCanvasElement): void {
  const cv = (window as unknown as { cv?: CvLike }).cv
  if (!cv?.Mat) { enhanceCanvas(canvas); return }
  let src: { delete: () => void } | null = null
  let gray: { delete: () => void } | null = null
  let dst: { delete: () => void } | null = null
  try {
    src = cv.imread(canvas)
    gray = new cv.Mat() as { delete: () => void }
    dst = new cv.Mat() as { delete: () => void }
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    // Blockgroesse ungerade, an die Bildgroesse gekoppelt und geclamped.
    const base = Math.floor(Math.min(canvas.width, canvas.height) / 25)
    const block = Math.min(51, Math.max(15, base % 2 === 0 ? base + 1 : base))
    cv.adaptiveThreshold(gray, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, block, 15)
    cv.imshow(canvas, dst)
  } catch {
    enhanceCanvas(canvas)
  } finally {
    src?.delete(); gray?.delete(); dst?.delete()
  }
}
