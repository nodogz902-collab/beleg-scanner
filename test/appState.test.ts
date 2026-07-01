import { describe, it, expect, beforeEach } from 'vitest'
import { view, selectedId, theme, goto, openDetail, applyTheme } from '../src/state/appState'

beforeEach(() => { goto('archive'); theme.value = 'system' })

describe('appState', () => {
  it('goto ändert view', () => { goto('scan'); expect(view.value).toBe('scan') })
  it('openDetail setzt id und view', () => { openDetail('x'); expect(selectedId.value).toBe('x'); expect(view.value).toBe('detail') })
  it('applyTheme setzt data-theme für dark, entfernt bei system', () => {
    theme.value = 'dark'; applyTheme(); expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    theme.value = 'system'; applyTheme(); expect(document.documentElement.getAttribute('data-theme')).toBe(null)
  })
})
