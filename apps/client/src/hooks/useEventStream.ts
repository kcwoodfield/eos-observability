import { useEffect, useRef, useState } from 'react'
import { MAX_EVENTS_TO_DISPLAY, WS_URL } from '@/lib/config'
import type { ObservabilityEvent } from '@/lib/types'

interface WebSocketMessage {
  type: 'initial' | 'event'
  data: ObservabilityEvent | ObservabilityEvent[]
}

export function useEventStream() {
  const [events, setEvents] = useState<ObservabilityEvent[]>([])
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

  return { events, isConnected }
}
