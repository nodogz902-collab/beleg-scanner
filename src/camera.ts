export function fitDimensions(w: number, h: number, maxDim: number): { width: number; height: number } {
  const longer = Math.max(w, h)
  if (longer <= maxDim) return { width: w, height: h }
  const scale = maxDim / longer
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 2560 }, height: { ideal: 1920 } },
    audio: false,
  })
  video.srcObject = stream
  await video.play()
  return stream
}

export function stopCamera(stream: MediaStream): void {
  stream.getTracks().forEach(t => t.stop())
}

export function captureFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d')!.drawImage(video, 0, 0)
  return canvas
}

export function downscale(canvas: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const { width, height } = fitDimensions(canvas.width, canvas.height, maxDim)
  if (width === canvas.width) return canvas
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  out.getContext('2d')!.drawImage(canvas, 0, 0, width, height)
  return out
}
