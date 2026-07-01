import { describe, it, expect } from 'vitest'
import { clientToImage } from '../src/cropEditor'

const rect = { left: 100, top: 50, width: 200, height: 400 }

describe('clientToImage', () => {
  it('rechnet Anzeige- in Bildkoordinaten um', () => {
    // Klick in der Mitte der Anzeige → Mitte des Bildes
    const p = clientToImage(200, 250, rect, 1000, 2000)
    expect(p).toEqual({ x: 500, y: 1000 })
  })
  it('clippt außerhalb liegende Punkte an den Bildrand', () => {
    const p = clientToImage(50, 10, rect, 1000, 2000)
    expect(p).toEqual({ x: 0, y: 0 })
  })
})
