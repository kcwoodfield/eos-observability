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
