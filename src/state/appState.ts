import { signal } from '@preact/signals'

export type View = 'scan' | 'edit' | 'archive' | 'detail' | 'settings'
export const view = signal<View>('archive')
export const draftPages = signal<HTMLCanvasElement[]>([])
export const selectedId = signal<string | null>(null)
export const archiveQuery = signal<{ jahr?: number; monat?: number; lieferant?: string; kategorie?: string; tag?: string; text?: string }>({})
export const theme = signal<'light' | 'dark' | 'system'>('system')

export function goto(v: View): void { view.value = v }
export function openDetail(id: string): void { selectedId.value = id; view.value = 'detail' }
export function applyTheme(): void {
  const el = document.documentElement
  if (theme.value === 'system') el.removeAttribute('data-theme')
  else el.setAttribute('data-theme', theme.value)
}
