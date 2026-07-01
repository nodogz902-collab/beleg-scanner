import type { ComponentChildren } from 'preact'
export function Button(
  { variant = 'primary', onClick, disabled, type = 'button', children }:
  { variant?: 'primary'|'secondary'|'ghost'|'danger'; onClick?: () => void; disabled?: boolean; type?: 'button'|'submit'; children: ComponentChildren },
) {
  return <button type={type} class={`btn btn-${variant}`} disabled={disabled} onClick={onClick}>{children}</button>
}
