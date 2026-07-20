import { useEffect, useState } from 'react'

// Ticks once a second so "running" status and in-progress spans stay live
// without every consumer wiring its own interval.
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
