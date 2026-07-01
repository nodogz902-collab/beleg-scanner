import { render, screen } from '@testing-library/preact'
import { describe, it, expect } from 'vitest'
import { App } from '../src/app'

describe('App', () => {
  it('rendert die App-Shell mit Tab-Navigation', () => {
    render(<App />)
    expect(screen.getByText('Scannen')).toBeTruthy()
  })
})
