import { describe, it, expect } from 'vitest'
import { autoContrast } from '../src/enhance'

describe('autoContrast', () => {
  it('streckt Min→0 und Max→255', () => {
    // zwei Pixel: (50,50,50,255) und (100,100,100,255)
    const data = new Uint8ClampedArray([50, 50, 50, 255, 100, 100, 100, 255])
    autoContrast(data)
    expect(data[0]).toBe(0)
    expect(data[4]).toBe(255)
    expect(data[3]).toBe(255) // Alpha unverändert
    expect(data[7]).toBe(255)
  })

  it('konstantes Bild bleibt unverändert (keine Division durch 0)', () => {
    const data = new Uint8ClampedArray([120, 120, 120, 255])
    autoContrast(data)
    expect(data[0]).toBe(120)
  })
})
