interface ShareDeps {
  nav?: {
    canShare?: (data?: unknown) => boolean
    share?: (data: unknown) => Promise<void>
  }
  download?: (blob: Blob, filename: string) => void
}

function defaultDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function sharePdf(
  blob: Blob,
  filename: string,
  deps: ShareDeps = {},
): Promise<'shared' | 'downloaded'> {
  const nav = deps.nav ?? (typeof navigator !== 'undefined' ? (navigator as ShareDeps['nav']) : {})
  const download = deps.download ?? defaultDownload
  const file = new File([blob], filename, { type: 'application/pdf' })
  const data = { files: [file], title: filename }
  try {
    if (nav?.share && (!nav.canShare || nav.canShare(data))) {
      await nav.share(data)
      return 'shared'
    }
  } catch {
    // Nutzer-Abbruch oder nicht unterstützt → Fallback
  }
  download(blob, filename)
  return 'downloaded'
}
