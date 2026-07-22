import { useEffect, useRef, useState } from 'react'
import { MAX_EVENTS_TO_DISPLAY, WS_URL } from '@/lib/config'
import type { HitlRequest, ObservabilityEvent, Ticket } from '@/lib/types'

interface WebSocketMessage {
  type: 'initial' | 'event' | 'hitl_initial' | 'hitl_created' | 'hitl_responded' | 'tickets_initial' | 'ticket'
  data: ObservabilityEvent | ObservabilityEvent[] | HitlRequest | HitlRequest[] | Ticket | Ticket[]
}

// One WS connection carries the event stream, HITL request notifications,
// and the tickets projection — they share the same live-broadcast transport
// rather than opening a separate socket per concern.
export function useEventStream() {
  const [events, setEvents] = useState<ObservabilityEvent[]>([])
  const [hitlRequests, setHitlRequests] = useState<HitlRequest[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const reconnectTimeout = useRef<number | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let cancelled = false

    const connect = () => {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => setIsConnected(true)

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data)

          if (message.type === 'initial') {
            const initial = Array.isArray(message.data) ? message.data : []
            setEvents(initial.slice(-MAX_EVENTS_TO_DISPLAY))
          } else if (message.type === 'event') {
            const incoming = message.data as ObservabilityEvent
            setEvents((prev) => {
              const next = [...prev, incoming]
              return next.length > MAX_EVENTS_TO_DISPLAY
                ? next.slice(next.length - MAX_EVENTS_TO_DISPLAY)
                : next
            })
          } else if (message.type === 'hitl_initial') {
            const initial = Array.isArray(message.data) ? (message.data as HitlRequest[]) : []
            setHitlRequests(initial)
          } else if (message.type === 'hitl_created') {
            const incoming = message.data as HitlRequest
            setHitlRequests((prev) => [...prev, incoming])
          } else if (message.type === 'hitl_responded') {
            const updated = message.data as HitlRequest
            setHitlRequests((prev) => prev.filter((r) => r.id !== updated.id))
          } else if (message.type === 'tickets_initial') {
            const initial = Array.isArray(message.data) ? (message.data as Ticket[]) : []
            setTickets(initial)
          } else if (message.type === 'ticket') {
            const incoming = message.data as Ticket
            setTickets((prev) => {
              const idx = prev.findIndex((t) => t.ticket_id === incoming.ticket_id)
              if (idx === -1) return [incoming, ...prev]
              const next = [...prev]
              next[idx] = incoming
              return next
            })
          }
        } catch (err) {
          console.error('Failed to parse stream message:', err)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        if (!cancelled) {
          reconnectTimeout.current = window.setTimeout(connect, 3000)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current)
      ws?.close()
    }
  }, [])

  return { events, hitlRequests, tickets, isConnected }
}
