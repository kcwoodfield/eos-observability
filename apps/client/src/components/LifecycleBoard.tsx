import { Badge } from '@/components/ui/badge'
import { identityColorVar } from '@/lib/identityColor'
import { formatSnakeLabel } from '@/lib/format'
import type { QualityGateResult, Ticket } from '@/lib/types'

function gateResultColor(result: QualityGateResult | undefined): string {
  if (result === 'pass') return 'var(--status-good)'
  if (result === 'fail') return 'var(--status-critical)'
  return 'var(--status-warning)'
}

function gateResultLabel(result: QualityGateResult | undefined): string {
  if (result === 'pass') return 'passed'
  if (result === 'fail') return 'failed'
  return 'pending'
}

export function LifecycleBoard({ tickets }: { tickets: Ticket[] }) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Lifecycle Board
        </h2>
        {tickets.length > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
            {tickets.length}
          </Badge>
        )}
      </div>

      <div className="max-h-40 overflow-y-auto px-4 py-3">
        {tickets.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No stage transitions yet — tickets appear here once a role announces one
            (<code className="font-mono">send_stage_transition.py</code>).
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((ticket) => {
              const color = identityColorVar(ticket.ticket_id)

              return (
                <div
                  key={ticket.ticket_id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="shrink-0 font-mono text-xs font-medium">{ticket.ticket_id}</span>
                    <span className="truncate text-xs text-muted-foreground">{ticket.application}</span>
                  </div>

                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {formatSnakeLabel(ticket.stage)}
                  </Badge>

                  {ticket.role && (
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                      {ticket.role}
                    </span>
                  )}

                  {ticket.gate && (
                    <span className="flex shrink-0 items-center gap-1 text-xs">
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: gateResultColor(ticket.gate_result) }}
                      />
                      <span className="text-muted-foreground">
                        {formatSnakeLabel(ticket.gate)} {gateResultLabel(ticket.gate_result)}
                      </span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
