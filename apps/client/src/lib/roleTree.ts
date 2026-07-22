import type { ObservabilityEvent } from '@/lib/types'

export interface TreeStage {
  stage: string
  timestamp: number
  active: boolean
}

export type TreeItem =
  | { type: 'leaf'; stage: TreeStage }
  | { type: 'branch'; role: string; stages: TreeStage[] }

export interface RoleTree {
  rootRole: string
  items: TreeItem[]
}

// Rebuilds "who actually worked this ticket, in what order" from its
// stage-transition history — a real call tree, not the static EOS role
// diagram. Engineering Lead (the orchestrator per eos/roles/) is the root
// when present; every other role that appears becomes a branch, grouping
// that role's stages together even if they're not contiguous in time, but
// ordered overall by when each first appears — so it reads as a timeline,
// not an alphabetical org chart.
export function buildRoleTree(
  events: ObservabilityEvent[],
  currentStage: string | undefined
): RoleTree | null {
  const transitions = events
    .filter((e) => e.lifecycle?.stage && e.lifecycle.role)
    .sort((a, b) => a.timestamp - b.timestamp)

  if (transitions.length === 0) return null

  const rootRole =
    transitions.find((e) => e.lifecycle!.role === 'Engineering Lead')?.lifecycle!.role ??
    transitions[0].lifecycle!.role!

  type Sortable = { sortTs: number } & TreeItem
  const items: Sortable[] = []
  const branchIndex = new Map<string, number>()

  for (const e of transitions) {
    const role = e.lifecycle!.role!
    const stage = e.lifecycle!.stage!
    const treeStage: TreeStage = { stage, timestamp: e.timestamp, active: stage === currentStage }

    if (role === rootRole) {
      items.push({ type: 'leaf', stage: treeStage, sortTs: e.timestamp })
    } else {
      const idx = branchIndex.get(role)
      if (idx === undefined) {
        branchIndex.set(role, items.length)
        items.push({ type: 'branch', role, stages: [treeStage], sortTs: e.timestamp })
      } else {
        const branch = items[idx]
        if (branch.type === 'branch') branch.stages.push(treeStage)
      }
    }
  }

  items.sort((a, b) => a.sortTs - b.sortTs)

  return { rootRole, items: items.map(({ sortTs: _sortTs, ...rest }) => rest) }
}
