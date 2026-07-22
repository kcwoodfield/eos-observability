import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { identityColorVar } from '@/lib/identityColor'
import { respondToHitlRequest } from '@/lib/hitl'
import type { HitlRequest } from '@/lib/types'

// The Approval-gate / escalation inbox (PRD §6, §8). The agent-side script
// is blocked on a long-poll waiting for exactly one of these to resolve —
// clicking Approve/Deny here is what unblocks it, not a separate step.
export function HitlInbox({ requests }: { requests: HitlRequest[] }) {
  const [pendingId, setPendingId] = useState<number | null>(null)

  if (requests.length === 0) return null

  async function respond(request: HitlRequest, status: 'approved' | 'denied') {
    setPendingId(request.id)
    try {
      await respondToHitlRequest(request.id, status)
    } catch (err) {
      console.error('Failed to respond to HITL request:', err)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="border-b border-border bg-[var(--status-warning)]/10">
      <div className="flex items-center gap-1.5 px-4 pt-3">
        <AlertCircle className="size-3.5 text-[var(--status-warning)]" strokeWidth={2.5} />
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Awaiting your response
        </h2>
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
          {requests.length}
        </Badge>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        {requests.map((request) => {
          const color = identityColorVar(request.session_id)
          const busy = pendingId === request.id

          return (
            <div
              key={request.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  <span className="truncate">{request.source_app}</span>
                  {request.ticket_id && (
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                      {request.ticket_id}
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">{request.question}</p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={() => respond(request, 'denied')}
                >
                  Deny
                </Button>
                <Button
                  size="xs"
                  className="cursor-pointer"
                  disabled={busy}
                  onClick={() => respond(request, 'approved')}
                >
                  Approve
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
