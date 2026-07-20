import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getEventTypeIcon, isSuccessEvent } from '@/lib/eventTypeMeta'
import { identityColorVar } from '@/lib/identityColor'
import { deriveSessionSummaries } from '@/lib/sessionSummary'
import { useNow } from '@/hooks/useNow'
import type { ObservabilityEvent } from '@/lib/types'

const RANGES = [
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: 'all', label: 'All', ms: null },
] as const

type RangeKey = (typeof RANGES)[number]['key']

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function pct(ts: number, domainStart: number, domainEnd: number): number {
  if (domainEnd <= domainStart) return 100
  return Math.min(100, Math.max(0, ((ts - domainStart) / (domainEnd - domainStart)) * 100))
}

interface EventMarker {
  events: { id: number; timestamp: number; event_type: string }[]
  leftPct: number
}

// Events within CLUSTER_THRESHOLD_PCT of each other on the track collapse into
// one marker. Without this, tightly-timed events render as fully overlapping
// ~16px targets that neither a pointer nor Playwright can reliably hit —
// found via the dataviz skill's ≥24px hit-target rule while verifying this
// component in a real browser.
const CLUSTER_THRESHOLD_PCT = 2.5

function clusterEvents(
  events: { id: number; timestamp: number; event_type: string }[],
  domainStart: number,
  domainEnd: number
): EventMarker[] {
  const clusters: EventMarker[] = []

  for (const evt of events) {
    const left = pct(evt.timestamp, domainStart, domainEnd)
    const last = clusters[clusters.length - 1]

    if (last && left - last.leftPct < CLUSTER_THRESHOLD_PCT) {
      last.events.push(evt)
      last.leftPct = (last.leftPct * (last.events.length - 1) + left) / last.events.length
    } else {
      clusters.push({ events: [evt], leftPct: left })
    }
  }

  return clusters
}

export function ActivityTimeline({ events }: { events: ObservabilityEvent[] }) {
  const [range, setRange] = useState<RangeKey>('5m')
  const now = useNow()
  const sessions = deriveSessionSummaries(events, now)

  const rangeMs = RANGES.find((r) => r.key === range)?.ms
  const domainEnd = now
  const domainStart =
    rangeMs != null
      ? now - rangeMs
      : sessions.length > 0
        ? Math.min(...sessions.map((s) => s.firstTs))
        : now - 5 * 60_000

  const visibleSessions = sessions.filter((s) => s.lastTs >= domainStart)

  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Live Activity
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.key}
              size="xs"
              variant={range === r.key ? 'secondary' : 'ghost'}
              className="cursor-pointer"
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="max-h-48 overflow-y-auto px-4 py-3">
        {visibleSessions.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No active sessions in this window.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleSessions.map((session) => {
              const color = identityColorVar(session.session_id)
              const segmentStart = pct(Math.max(session.firstTs, domainStart), domainStart, domainEnd)
              const segmentEnd = pct(
                session.status === 'running' ? now : session.lastTs,
                domainStart,
                domainEnd
              )

              return (
                <div key={session.session_id} className="flex items-center gap-3">
                  <div className="flex w-44 shrink-0 items-center gap-1.5 overflow-hidden">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate text-xs font-medium">{session.source_app}</span>
                    <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
                      {session.session_id.slice(0, 6)}
                    </span>
                  </div>

                  <div className="relative h-5 min-w-0 flex-1">
                    <div className="absolute inset-y-1/2 w-full -translate-y-1/2 border-t border-dashed border-border" />

                    <div
                      className="absolute inset-y-1/2 h-0.5 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${segmentStart}%`,
                        width: `${Math.max(0, segmentEnd - segmentStart)}%`,
                        backgroundColor: color,
                        opacity: 0.5,
                      }}
                    />

                    {clusterEvents(session.events, domainStart, domainEnd).map((cluster) => {
                      const latest = cluster.events[cluster.events.length - 1]
                      const Icon = getEventTypeIcon(latest.event_type)
                      const success = isSuccessEvent(latest.event_type)
                      const clusterKey = cluster.events.map((e) => e.id).join('-')

                      return (
                        <div
                          key={clusterKey}
                          className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                          style={{ left: `${cluster.leftPct}%` }}
                        >
                          {/* 24px transparent hit area (dataviz skill: marks need a hit
                              target bigger than the visible pixels) around a smaller visible dot */}
                          <button
                            type="button"
                            tabIndex={0}
                            className="flex size-6 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            <span
                              className="flex size-4 items-center justify-center rounded-full border border-background"
                              style={{ backgroundColor: success ? 'var(--status-good)' : color }}
                            >
                              <Icon className="size-2.5 text-white" strokeWidth={2.5} />
                            </span>
                            {cluster.events.length > 1 && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-foreground px-0.5 text-[9px] font-semibold text-background tabular-nums">
                                {cluster.events.length}
                              </span>
                            )}
                          </button>

                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md group-hover:block group-focus-within:block">
                            {cluster.events.length === 1 ? (
                              <>
                                <span className="font-medium tabular-nums">{formatClock(latest.timestamp)}</span>
                                <span className="text-muted-foreground"> · {latest.event_type}</span>
                              </>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {cluster.events.map((evt) => (
                                  <div key={evt.id}>
                                    <span className="font-medium tabular-nums">{formatClock(evt.timestamp)}</span>
                                    <span className="text-muted-foreground"> · {evt.event_type}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                    {session.status === 'running' ? (
                      <>
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--status-good)] opacity-75" />
                          <span className="relative inline-flex size-2 rounded-full bg-[var(--status-good)]" />
                        </span>
                        <span className="text-xs text-muted-foreground">running</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">completed</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
