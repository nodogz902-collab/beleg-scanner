import type { Page } from './types'

export class PageStore {
  private pages: Page[] = []
  private seq = 0

  add(page: Omit<Page, 'id'>): Page {
    const full: Page = { ...page, id: `p${++this.seq}` }
    this.pages.push(full)
    return full
  }

  remove(id: string): void {
    this.pages = this.pages.filter(p => p.id !== id)
  }

  move(id: string, direction: -1 | 1): void {
    const i = this.pages.findIndex(p => p.id === id)
    if (i < 0) return
    const j = i + direction
    if (j < 0 || j >= this.pages.length) return
    ;[this.pages[i], this.pages[j]] = [this.pages[j], this.pages[i]]
  }

  list(): Page[] {
    return [...this.pages]
  }

  count(): number {
    return this.pages.length
  }

  clear(): void {
    this.pages = []
    this.seq = 0
  }
}
