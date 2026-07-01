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

export interface Receipt {
  id: string
  createdAt: number
  belegdatum: string
  jahr: number
  monat: number
  betrag: number | null
  lieferant: string
  kategorie: string
  tags: string[]
  notiz: string
  pageBlobs: Blob[]
  pdfBlob: Blob
  thumbnailDataUrl: string
  ocrText: string
}
