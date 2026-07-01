import { startCamera, stopCamera, captureFrame, downscale } from './camera'
import { detectQuad, warp } from './detect'
import { mountCropEditor } from './cropEditor'
import { enhanceCanvas } from './enhance'
import { PageStore } from './pages'
import { recognizeFirstPage, suggestTitle, dateStamp } from './ocr'
import { buildPdf } from './pdf'
import { sharePdf } from './share'
import type { Quad } from './types'

const MAX_DIM = 2000
const store = new PageStore()

export function startApp(root: HTMLElement): void {
  showCapture(root)
}

function screen(root: HTMLElement, title: string): HTMLElement {
  root.innerHTML = `<header class="bar">${title}</header><main class="screen"></main>`
  return root.querySelector('main')!
}

async function showCapture(root: HTMLElement) {
  const main = screen(root, 'Aufnahme')
  const video = document.createElement('video')
  video.playsInline = true
  main.appendChild(video)
  const shot = button('Foto aufnehmen', 'primary')
  main.appendChild(shot)
  let stream: MediaStream | undefined
  let stopped = false
  function stopOnce() {
    if (stopped || !stream) return
    stopped = true
    stopCamera(stream)
  }
  if (store.count() > 0) {
    const done = button(`Fertig (${store.count()} Seiten)`, 'secondary')
    done.onclick = () => {
      done.disabled = true
      stopOnce()
      showPages(root)
    }
    main.appendChild(done)
  }
  try {
    stream = await startCamera(video)
  } catch {
    main.appendChild(note('Kamerazugriff verweigert. In den Safari-Einstellungen für diese Seite die Kamera erlauben.'))
    return
  }
  shot.onclick = async () => {
    shot.disabled = true
    const full = downscale(captureFrame(video), MAX_DIM)
    stopOnce()
    try {
      const quad = await detectQuad(full)
      showCrop(root, full, quad)
    } catch {
      showCapture(root)
    }
  }
}

function showCrop(root: HTMLElement, canvas: HTMLCanvasElement, quad: Quad) {
  const main = screen(root, 'Zuschneiden')
  const holder = document.createElement('div')
  main.appendChild(holder)
  const editor = mountCropEditor(holder, canvas, quad)
  const retake = button('Neu aufnehmen', 'secondary')
  retake.onclick = () => {
    retake.disabled = true
    editor.destroy()
    showCapture(root)
  }
  const ok = button('Übernehmen', 'primary')
  ok.onclick = () => {
    ok.disabled = true
    const finalQuad = editor.getQuad()
    editor.destroy()
    const warped = warp(canvas, finalQuad)
    enhanceCanvas(warped)
    const url = warped.toDataURL('image/jpeg', 0.85)
    store.add({ width: warped.width, height: warped.height, thumbnailUrl: url })
    showPages(root)
  }
  main.append(retake, ok)
}

function showPages(root: HTMLElement) {
  const main = screen(root, 'Seiten')
  const pages = store.list()
  if (pages.length === 0) {
    showCapture(root)
    return
  }
  pages.forEach((page, i) => {
    const row = document.createElement('div')
    row.className = 'page-row'
    const img = document.createElement('img')
    img.src = page.thumbnailUrl
    row.appendChild(img)
    const up = button('↑', 'secondary')
    up.disabled = i === 0
    up.onclick = () => {
      store.move(page.id, -1)
      showPages(root)
    }
    const down = button('↓', 'secondary')
    down.disabled = i === pages.length - 1
    down.onclick = () => {
      store.move(page.id, 1)
      showPages(root)
    }
    const del = button('✕ Löschen', 'secondary')
    del.onclick = () => {
      store.remove(page.id)
      showPages(root)
    }
    row.append(up, down, del)
    main.appendChild(row)
  })
  const add = button('+ Seite hinzufügen', 'secondary')
  add.onclick = () => showCapture(root)
  const done = button('Fertig', 'primary')
  done.onclick = () => showFinish(root)
  main.append(add, done)
}

async function showFinish(root: HTMLElement) {
  const main = screen(root, 'Name & Teilen')
  main.appendChild(note('Text wird erkannt …'))
  const first = store.list()[0]
  let title = `Beleg-${dateStamp(new Date())}`
  try {
    const text = await recognizeFirstPage(first.thumbnailUrl)
    title = suggestTitle(text, new Date())
  } catch { /* Default behalten */ }
  main.innerHTML = ''
  const input = document.createElement('input')
  input.type = 'text'
  input.value = title
  input.className = 'name-input'
  const share = button('PDF teilen', 'primary')
  share.onclick = async () => {
    share.disabled = true
    try {
      const images = store.list().map(p => p.thumbnailUrl)
      const blob = buildPdf(images)
      await sharePdf(blob, `${input.value.trim() || title}.pdf`)
    } finally {
      share.disabled = false
    }
  }
  const back = button('Zurück', 'secondary')
  back.onclick = () => showPages(root)
  main.append(input, share, back)
}

function button(label: string, kind: 'primary' | 'secondary'): HTMLButtonElement {
  const b = document.createElement('button')
  b.textContent = label
  b.className = `btn ${kind}`
  return b
}
function note(text: string): HTMLParagraphElement {
  const p = document.createElement('p')
  p.className = 'note'
  p.textContent = text
  return p
}
