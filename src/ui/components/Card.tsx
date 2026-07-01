import type { ComponentChildren } from 'preact'
export function Card({ onClick, children }: { onClick?: () => void; children: ComponentChildren }) {
  return <div class="card" onClick={onClick} style={onClick ? 'cursor:pointer' : undefined}>{children}</div>
}
