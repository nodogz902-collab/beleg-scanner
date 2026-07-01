import { describe, it, expect } from 'vitest'
import { quadAreaRatio, isStableQuad } from '../src/scan/liveDetect'
import type { Quad } from '../src/types'

const full = (w: number, h: number): Quad => ({ topLeft: {x:0,y:0}, topRight:{x:w,y:0}, bottomRight:{x:w,y:h}, bottomLeft:{x:0,y:h} })

describe('liveDetect heuristik', () => {
  it('quadAreaRatio: Vollbild = 1, halbe Breite = 0.5', () => {
    expect(quadAreaRatio(full(100,100), 100, 100)).toBeCloseTo(1, 5)
    const half: Quad = { topLeft:{x:0,y:0}, topRight:{x:50,y:0}, bottomRight:{x:50,y:100}, bottomLeft:{x:0,y:100} }
    expect(quadAreaRatio(half, 100, 100)).toBeCloseTo(0.5, 5)
  })
  it('isStableQuad true bei geringem Jitter', () => {
    const h = [full(100,100), full(100,100), full(100,100)]
    expect(isStableQuad(h, 5)).toBe(true)
  })
  it('isStableQuad false bei großem Jitter', () => {
    const moved: Quad = { topLeft:{x:20,y:20}, topRight:{x:100,y:0}, bottomRight:{x:100,y:100}, bottomLeft:{x:0,y:100} }
    expect(isStableQuad([full(100,100), full(100,100), moved], 5)).toBe(false)
  })
  it('isStableQuad false bei zu kurzer History', () => {
    expect(isStableQuad([full(100,100)], 5)).toBe(false)
  })
})
