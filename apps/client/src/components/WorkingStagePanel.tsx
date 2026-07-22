import { useMemo, useState } from 'react'
import { Check, X, Circle } from 'lucide-react'
import { AgentTree } from '@/components/AgentTree'
import { Badge } from '@/components/ui/badge'
import { formatSnakeLabel } from '@/lib/format'
import { identityColorVar } from '@/lib/identityColor'
import { groupTicketsByApplication } from '@/lib/ticketSummary'
import { QUALITY_GATES } from '@/lib/types'
import type { ObservabilityEvent, QualityGate, QualityGateResult, Ticket } from '@/lib/types'
import { useTicketHistory } from '@/hooks/useTicketHistory'

function GateRow({ gate, result }: { gate: QualityGate; result: QualityGateResult | undefined }) {
  const icon =
    result === 'pass' ? (
      <Check className="size-3" style={{ color: 'var(--status-good)' }} strokeWidth={3} />
    ) : result === 'fail' ? (
      <X className="size-3" style={{ color: 'var(--status-critical)' }} strokeWidth={3} />
    ) : result === 'pending' ? (
      <Circle className="size-2 fill-current" style={{ color: 'var(--status-warning)' }} />
    ) : (
      <Circle className="size-2 text-muted-foreground/40" />
    )

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <span className="flex size-3.5 shrink-0 items-center justify-center">{icon}</span>
      <span className={result ? 'text-foreground' : 'text-muted-foreground'}>
        {formatSnakeLabel(gate)}
      </span>
    </div>
  )
}

// Right-side "unit of work" panel: Application → Epic → Ticket (per eos/
// standards/Application Mapping Standard.md's Epic grouping section — an
// application already plays the role a Jira-style tool would call
// "Project", so it isn't duplicated as a separate tier), with the six
// quality gates as the per-ticket checklist.
export function WorkingStagePanel({
  tickets,
  events,
}: {
  tickets: Ticket[]
  events: ObservabilityEvent[]
}) {
  const groups = useMemo(() => groupTicketsByApplication(tickets), [tickets])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = tickets.find((t) => t.ticket_id === selectedId) ?? tickets[0]
  const { events: ticketHistory } = useTicketHistory(selected?.ticket_id, events)

  if (tickets.length === 0) {
    return (
      <aside className="flex w-72 shrink-0 flex-col border-l border-border">
        <div className="px-3 pt-3">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Working Stage
          </h2>
        </div>
        <div className="px-3 py-4 text-xs text-muted-foreground">
          No tickets yet — this fills in once a role announces a stage transition.
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-border">
      <div className="px-3 pt-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Working Stage
        </h2>
      </div>

      <div className="flex flex-col gap-2 px-3 py-3">
        {groups.map((group) => (
          <div key={group.application}>
            <div className="text-xs font-semibold">{group.application}</div>
            {group.epics.map((epicGroup) => (
              <div key={epicGroup.epic ?? '__none__'} className="mt-1 pl-2">
                <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
                  {epicGroup.epic ?? 'No epic'}
                </div>
                <div className="mt-0.5 flex flex-col gap-0.5 pl-1.5">
                  {epicGroup.tickets.map((ticket) => {
                    const isSelected = ticket.ticket_id === selected?.ticket_id
                    return (
                      <button
                        key={ticket.ticket_id}
                        type="button"
                        onClick={() => setSelectedId(ticket.ticket_id)}
                        className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-muted ${
                          isSelected ? 'bg-muted' : ''
                        }`}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: identityColorVar(ticket.ticket_id) }}
                        />
                        <span className="truncate font-mono">{ticket.ticket_id}</span>
                        {ticket.ticket_kind && (
                          <Badge variant="outline" className="ml-auto shrink-0 text-[9px]">
                            {formatSnakeLabel(ticket.ticket_kind)}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {selected && (
        <div className="border-t border-border px-3 py-3">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-mono text-xs font-medium">{selected.ticket_id}</span>
            {selected.ticket_kind && (
              <Badge variant="outline" className="text-[9px]">
                {formatSnakeLabel(selected.ticket_kind)}
              </Badge>
            )}
          </div>
          <div className="mb-2 text-[10px] text-muted-foreground">
            Currently: {formatSnakeLabel(selected.stage)}
            {selected.role ? ` · ${selected.role}` : ''}
          </div>
          <div className="flex flex-col">
            {QUALITY_GATES.map((gate) => (
              <GateRow key={gate} gate={gate} result={selected.gate_results[gate]} />
            ))}
          </div>
        </div>
      )}

      {selected && <AgentTree events={ticketHistory} currentStage={selected.stage} />}
    </aside>
  )
}
