import { useEffect, useState } from 'react'
import { SERVER_URL } from '@/lib/config'
import type { EventQuery, ObservabilityEvent } from '@/lib/types'
import { useEventStream } from './useEventStream'

function matchesFilters(event: ObservabilityEvent, filters: EventQuery): boolean {
  if (filters.harness && event.harness !== filters.harness) return false
  if (filters.source_app && event.source_app !== filters.source_app) return false
  if (filters.session_id && event.session_id !== filters.session_id) return false
  if (filters.event_type && event.event_type !== filters.event_type) return false
  return true
}

// Combines a server-filtered REST query (GET /events) for the initial/backfill
// page with the live WebSocket stream for real-time updates — server-side
// filtering instead of the client-buffer-only filtering approach this
// replaces.
export function useObservabilityEvents(filters: EventQuery) {
  const [historyEvents, setHistoryEvents] = useState<ObservabilityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const { events: liveEvents, hitlRequests, tickets, isConnected } = useEventStream()

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.harness) params.set('harness', filters.harness)
    if (filters.source_app) params.set('source_app', filters.source_app)
    if (filters.session_id) params.set('session_id', filters.session_id)
    if (filters.event_type) params.set('event_type', filters.event_type)
    params.set('limit', String(filters.limit ?? 100))

    setLoading(true)
    fetch(`${SERVER_URL}/events?${params.toString()}`)
      .then((res) => res.json())
      .then((page) => setHistoryEvents(page.events))
      .catch((err) => console.error('Failed to load events:', err))
      .finally(() => setLoading(false))
  }, [filters.harness, filters.source_app, filters.session_id, filters.event_type, filters.limit])

  const liveMatching = liveEvents.filter((e) => matchesFilters(e, filters))
  const seen = new Set(historyEvents.map((e) => e.id))
  const merged = [...historyEvents, ...liveMatching.filter((e) => !seen.has(e.id))].sort(
    (a, b) => a.timestamp - b.timestamp
  )

  return { events: merged, hitlRequests, tickets, isConnected, loading }
}
