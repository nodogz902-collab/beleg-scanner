import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Receipt } from '../types'

export interface BelegDB extends DBSchema {
  receipts: {
    key: string
    value: Receipt
    indexes: {
      'by-monthKey': [number, number]
      'by-lieferant': string
      'by-kategorie': string
      'by-belegdatum': string
    }
  }
}

let dbPromise: Promise<IDBPDatabase<BelegDB>> | null = null

export function getDb(): Promise<IDBPDatabase<BelegDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BelegDB>('belegablage', 1, {
      upgrade(db) {
        const store = db.createObjectStore('receipts', { keyPath: 'id' })
        store.createIndex('by-monthKey', ['jahr', 'monat'])
        store.createIndex('by-lieferant', 'lieferant')
        store.createIndex('by-kategorie', 'kategorie')
        store.createIndex('by-belegdatum', 'belegdatum')
      },
    })
  }
  return dbPromise
}
