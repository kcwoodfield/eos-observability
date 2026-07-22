import { useEffect, useState } from 'react'
import { SERVER_URL } from '@/lib/config'
import type { ObservabilityEvent } from '@/lib/types'

// Backfills via the server-side ticket_id filter (GET /events?ticket_id=)
// rather than filtering whatever page of events happens to already be
// loaded — the same class of bug the tickets projection fixed for the
// Lifecycle Board (see PRD §12): a ticket's early transitions can scroll
// outside the default event window long before its history is short.
// `liveEvents` (the already-connected WS stream) is used only to append
// new matching transitions in real time, not for backfill.
export function useTicketHistory(ticketId: string | undefined, liveEvents: ObservabilityEvent[]) {
  const [historyEvents, setHistoryEvents] = useState<ObservabilityEvent[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!ticketId) {
      setHistoryEvents([])
      return
    }
    setLoading(true)
    fetch(`${SERVER_URL}/events?ticket_id=${encodeURIComponent(ticketId)}&limit=200`)
      .then((res) => res.json())
      .then((page) => setHistoryEvents(page.events))
      .catch((err) => console.error('Failed to load ticket history:', err))
      .finally(() => setLoading(false))
  }, [ticketId])

  const liveMatching = ticketId
    ? liveEvents.filter((e) => e.lifecycle?.resolution_packet?.ticket_id === ticketId)
    : []
  const seen = new Set(historyEvents.map((e) => e.id))
  const events = [...historyEvents, ...liveMatching.filter((e) => !seen.has(e.id))].sort(
    (a, b) => a.timestamp - b.timestamp
  )

  return { events, loading }
}
