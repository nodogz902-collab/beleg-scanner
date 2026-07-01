import { describe, it, expect } from 'vitest'
import { orderCorners, fullFrameQuad } from '../src/detect'

describe('orderCorners', () => {
  it('ordnet gemischte Punkte korrekt zu', () => {
    const pts = [
      { x: 10, y: 300 }, // bottomLeft
      { x: 200, y: 8 },  // topRight
      { x: 8, y: 10 },   // topLeft
      { x: 210, y: 310 },// bottomRight
    ]
    const q = orderCorners(pts)
    expect(q.topLeft).toEqual({ x: 8, y: 10 })
    expect(q.topRight).toEqual({ x: 200, y: 8 })
    expect(q.bottomRight).toEqual({ x: 210, y: 310 })
    expect(q.bottomLeft).toEqual({ x: 10, y: 300 })
  })
})

describe('fullFrameQuad', () => {
  it('spannt das ganze Bild auf', () => {
    const q = fullFrameQuad(100, 50)
    expect(q.topLeft).toEqual({ x: 0, y: 0 })
    expect(q.bottomRight).toEqual({ x: 100, y: 50 })
  })
})
