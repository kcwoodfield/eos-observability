// Deterministic categorical color assignment for dynamic identity keys
// (source_app, session_id). Same key always resolves to the same slot,
// independent of filters or render order — "color follows the entity,
// never its rank" (dataviz skill). Slot order is fixed (never cycled);
// only the input key picks which of the 8 documented slots is used.

const SLOT_COUNT = 8

function hashString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export function identitySlot(key: string): number {
  return hashString(key) % SLOT_COUNT
}

// Returns a `var(--series-N)` reference — resolves against whichever
// theme (light/dark) is active via the CSS custom properties in index.css.
export function identityColorVar(key: string): string {
  return `var(--series-${identitySlot(key) + 1})`
}
