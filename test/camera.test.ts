import { describe, it, expect } from 'vitest'
import { fitDimensions } from '../src/camera'

describe('fitDimensions', () => {
  it('lässt kleine Bilder unverändert', () => {
    expect(fitDimensions(800, 600, 2000)).toEqual({ width: 800, height: 600 })
  })
  it('skaliert die längere Kante auf maxDim', () => {
    expect(fitDimensions(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000 })
  })
  it('funktioniert auch für Hochformat', () => {
    expect(fitDimensions(2000, 4000, 2000)).toEqual({ width: 1000, height: 2000 })
  })
})
