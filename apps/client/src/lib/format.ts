export function formatSnakeLabel(value: string): string {
  return value
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

// The tail of a session ID is the distinguishing part far more often than
// the head: structured IDs like "session-id-demo-007-research" share a long
// common prefix across every role working the same ticket, and random IDs
// (UUIDs) are equally distinguishing from either end. Slicing from the end
// is a strict improvement for the former and neutral for the latter.
export function shortSessionId(sessionId: string, length = 8): string {
  return sessionId.length <= length ? sessionId : sessionId.slice(-length)
}

// CSS `truncate` only clips visually if an ancestor actually constrains
// width — a single unbroken string (e.g. a raw JSON payload with no
// whitespace to wrap on, like a full file's contents) can blow out a flex
// row's layout before CSS ever gets a chance to clip it. Cap the string
// itself so layout can't depend on that.
export function truncateText(value: string, length = 200): string {
  return value.length <= length ? value : `${value.slice(0, length)}…`
}
