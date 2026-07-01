export function Chip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return <span class="chip">{label}{onRemove && <button aria-label={`${label} entfernen`} onClick={onRemove}>×</button>}</span>
}
