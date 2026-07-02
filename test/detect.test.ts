import { describe, it, expect } from 'vitest'
import { isFullFrame, orderCorners, fullFrameQuad } from '../src/detect'

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

describe('isFullFrame', () => {
  it('erkennt den Vollbild-Quad als true', () => {
    expect(isFullFrame(fullFrameQuad(800, 600), 800, 600)).toBe(true)
  })
  it('erkennt einen echten Zuschnitt als false', () => {
    const quad = { topLeft: {x:10,y:20}, topRight: {x:790,y:15}, bottomRight: {x:780,y:590}, bottomLeft: {x:5,y:585} }
    expect(isFullFrame(quad, 800, 600)).toBe(false)
  })
})
