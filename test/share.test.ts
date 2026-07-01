import { describe, it, expect, vi } from 'vitest'
import { sharePdf } from '../src/share'

const blob = new Blob(['%PDF'], { type: 'application/pdf' })

describe('sharePdf', () => {
  it('nutzt navigator.share, wenn canShare true ist', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const nav = { canShare: () => true, share }
    const result = await sharePdf(blob, 'Test.pdf', { nav })
    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledOnce()
  })

  it('fällt auf Download zurück, wenn share fehlt', async () => {
    const download = vi.fn()
    const result = await sharePdf(blob, 'Test.pdf', { nav: {}, download })
    expect(result).toBe('downloaded')
    expect(download).toHaveBeenCalledWith(blob, 'Test.pdf')
  })

  it('fällt auf Download zurück, wenn share wirft', async () => {
    const download = vi.fn()
    const nav = { canShare: () => true, share: vi.fn().mockRejectedValue(new Error('x')) }
    const result = await sharePdf(blob, 'Test.pdf', { nav, download })
    expect(result).toBe('downloaded')
  })
})
