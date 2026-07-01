import { render, screen } from '@testing-library/preact'
import { describe, it, expect, vi } from 'vitest'
import { Button } from '../src/ui/components/Button'
import { Chip } from '../src/ui/components/Chip'

describe('primitives', () => {
  it('Button ruft onClick', () => {
    const fn = vi.fn(); render(<Button onClick={fn}>Klick</Button>)
    screen.getByText('Klick').click(); expect(fn).toHaveBeenCalledOnce()
  })
  it('Chip zeigt Entfernen nur mit onRemove', () => {
    const fn = vi.fn(); render(<Chip label="Tag" onRemove={fn} />)
    screen.getByLabelText('Tag entfernen').click(); expect(fn).toHaveBeenCalledOnce()
  })
})
