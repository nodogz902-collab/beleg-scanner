import { describe, it, expect, beforeEach } from 'vitest'
import { PageStore } from '../src/pages'

function fakePage(tag: string) {
  return { image: new Blob([tag]), width: 100, height: 200, thumbnailUrl: `data:${tag}` }
}

describe('PageStore', () => {
  let store: PageStore
  beforeEach(() => { store = new PageStore() })

  it('add vergibt eindeutige ids und zählt', () => {
    const a = store.add(fakePage('a'))
    const b = store.add(fakePage('b'))
    expect(a.id).not.toBe(b.id)
    expect(store.count()).toBe(2)
  })

  it('remove löscht die richtige Seite', () => {
    const a = store.add(fakePage('a'))
    store.add(fakePage('b'))
    store.remove(a.id)
    expect(store.count()).toBe(1)
    expect(store.list()[0].thumbnailUrl).toBe('data:b')
  })

  it('move tauscht die Reihenfolge', () => {
    const a = store.add(fakePage('a'))
    const b = store.add(fakePage('b'))
    store.move(b.id, -1)
    expect(store.list().map(p => p.id)).toEqual([b.id, a.id])
  })

  it('move an den Rändern ist ein no-op', () => {
    const a = store.add(fakePage('a'))
    store.move(a.id, -1)
    expect(store.list()[0].id).toBe(a.id)
  })
})
