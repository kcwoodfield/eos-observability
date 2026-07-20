import { Badge } from '@/components/ui/badge'
import { getEventTypeIcon, isSuccessEvent } from '@/lib/eventTypeMeta'
import { identityColorVar } from '@/lib/identityColor'
import type { ObservabilityEvent } from '@/lib/types'

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function IdentityPill({
  label,
  colorVar,
  monospace = false,
}: {
  label: string
  colorVar: string
  monospace?: boolean
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium ${monospace ? 'font-mono' : ''}`}
      style={{ borderColor: colorVar, color: colorVar }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorVar }} />
      {label}
    </span>
  )
}

export function EventRow({ event }: { event: ObservabilityEvent }) {
  const sourceColor = identityColorVar(event.source_app)
  const sessionColor = identityColorVar(event.session_id)
  const Icon = getEventTypeIcon(event.event_type)
  const success = isSuccessEvent(event.event_type)

  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 pr-4 text-sm">
      <div className="flex h-6 shrink-0 items-stretch gap-0.5 self-stretch">
        <span className="w-[3px] rounded-full" style={{ backgroundColor: sourceColor }} />
        <span className="w-[3px] rounded-full" style={{ backgroundColor: sessionColor }} />
      </div>

      <Badge variant="outline" className="shrink-0 font-mono text-[10px] uppercase">
        {event.harness}
      </Badge>

      <IdentityPill label={event.source_app} colorVar={sourceColor} />
      <IdentityPill label={event.session_id.slice(0, 8)} colorVar={sessionColor} monospace />

      <Badge
        className="shrink-0 gap-1"
        style={
          success
            ? { backgroundColor: 'var(--status-good)', color: 'white' }
            : undefined
        }
        variant={success ? 'default' : 'secondary'}
      >
        <Icon className="size-3" />
        {event.event_type}
      </Badge>

      {event.lifecycle?.stage && (
        <Badge variant="outline" className="shrink-0 border-dashed">
          {event.lifecycle.stage}
        </Badge>
      )}

      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {event.summary ?? JSON.stringify(event.payload)}
      </span>

      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {formatTime(event.timestamp)}
      </span>
    </div>
  )
}
