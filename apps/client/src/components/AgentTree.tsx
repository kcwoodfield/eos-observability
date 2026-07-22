import { formatSnakeLabel } from '@/lib/format'
import { buildRoleTree } from '@/lib/roleTree'
import type { ObservabilityEvent } from '@/lib/types'

function TreeLine({ prefix, label, active }: { prefix: string; label: string; active: boolean }) {
  return (
    <div
      className={`whitespace-pre font-mono text-[11px] leading-relaxed ${
        active ? 'font-semibold text-[var(--agent-tree-active)]' : 'text-muted-foreground'
      }`}
    >
      {prefix}
      {label}
    </div>
  )
}

// Dynamic per-ticket call tree — who actually worked this ticket, in what
// order, built from real stage-transition history (not the static EOS role
// diagram). Grey by default; the stage matching the ticket's current stage
// lights up in terminal green.
export function AgentTree({
  events,
  currentStage,
}: {
  events: ObservabilityEvent[]
  currentStage: string | undefined
}) {
  const tree = buildRoleTree(events, currentStage)

  return (
    <div className="border-t border-border px-3 py-3">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Agent Tree
      </h3>

      {!tree ? (
        <div className="text-xs text-muted-foreground">No stage history yet.</div>
      ) : (
        <div>
          <div className="font-mono text-[11px] font-medium">{tree.rootRole}</div>
          {tree.items.map((item, i) => {
            const isLast = i === tree.items.length - 1
            const branchPrefix = isLast ? '└── ' : '├── '

            if (item.type === 'leaf') {
              return (
                <TreeLine
                  key={`${item.stage.stage}-${item.stage.timestamp}`}
                  prefix={branchPrefix}
                  label={formatSnakeLabel(item.stage.stage)}
                  active={item.stage.active}
                />
              )
            }

            return (
              <div key={item.role}>
                <TreeLine
                  prefix={branchPrefix}
                  label={item.role}
                  active={item.stages.some((s) => s.active)}
                />
                {item.stages.map((s, j) => {
                  const stageIsLast = j === item.stages.length - 1
                  const childPrefix = (isLast ? '    ' : '│   ') + (stageIsLast ? '└── ' : '├── ')
                  return (
                    <TreeLine
                      key={`${s.stage}-${s.timestamp}`}
                      prefix={childPrefix}
                      label={formatSnakeLabel(s.stage)}
                      active={s.active}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
