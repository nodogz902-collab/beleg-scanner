export interface Point {
  x: number
  y: number
}

export interface Quad {
  topLeft: Point
  topRight: Point
  bottomRight: Point
  bottomLeft: Point
}

export interface Page {
  id: string
  width: number
  height: number
  thumbnailUrl: string
}
