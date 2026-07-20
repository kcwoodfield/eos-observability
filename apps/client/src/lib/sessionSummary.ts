import type { ObservabilityEvent, TokenUsage } from '@/lib/types'

// A session reads as "running" if its most recent event is recent and isn't
// itself a terminal event. Terminal event types end the session immediately
// regardless of how recent they are.
const RUNNING_THRESHOLD_MS = 30_000
const TERMINAL_EVENT_TYPES = new Set(['SessionEnd', 'Stop'])

interface SessionEventRef {
  id: number
  timestamp: number
  event_type: string
  token_usage?: TokenUsage
}

export interface SessionSummary {
  session_id: string
  source_app: string
  harness: string
  firstTs: number
  lastTs: number
  status: 'running' | 'completed'
  events: SessionEventRef[]
  // Cumulative usage as of the most recent event that reported it — not
  // every event/harness populates this, so it's the last known value, not
  // necessarily from the literal last event.
  tokenUsage?: TokenUsage
}

export function deriveSessionSummaries(events: ObservabilityEvent[], now: number): SessionSummary[] {
  const bySession = new Map<string, SessionSummary>()

  for (const event of events) {
    let session = bySession.get(event.session_id)
    if (!session) {
      session = {
        session_id: event.session_id,
        source_app: event.source_app,
        harness: event.harness,
        firstTs: event.timestamp,
        lastTs: event.timestamp,
        status: 'completed',
        events: [],
      }
      bySession.set(event.session_id, session)
    }

    session.firstTs = Math.min(session.firstTs, event.timestamp)
    session.lastTs = Math.max(session.lastTs, event.timestamp)
    session.events.push({
      id: event.id,
      timestamp: event.timestamp,
      event_type: event.event_type,
      token_usage: event.token_usage,
    })
  }

  for (const session of bySession.values()) {
    session.events.sort((a, b) => a.timestamp - b.timestamp)

    const latest = session.events[session.events.length - 1]
    const isTerminal = TERMINAL_EVENT_TYPES.has(latest.event_type)
    const isRecent = now - session.lastTs < RUNNING_THRESHOLD_MS
    session.status = !isTerminal && isRecent ? 'running' : 'completed'

    for (const evt of session.events) {
      if (evt.token_usage) session.tokenUsage = evt.token_usage
    }
  }

  return [...bySession.values()].sort((a, b) => b.lastTs - a.lastTs)
}
