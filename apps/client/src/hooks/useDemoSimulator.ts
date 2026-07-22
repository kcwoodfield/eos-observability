import { useEffect } from 'react'
import { SERVER_URL } from '@/lib/config'

// Drives the REAL server (not a client-side mock) through one fake ticket's
// full lifecycle, compressed into a repeating loop, so ?demo=true produces a
// short, repeatable clip to record — reuses the exact same ingest → tickets
// projection → WS broadcast pipeline a real adapter would, just compressed
// in time and looped.
//
// "The gated loop": every quality gate — not just Approval — now requires an
// approved HITL confirmation before it can be marked passed (enforced
// server-side, see index.ts's assertion on POST /events/stage-transition).
// So each gated stage here runs pending -> HITL request -> auto-approve ->
// pass, mirroring what a real role would have to do.
const TICKET_ID = 'DEMO-007'
const APPLICATION = 'Demo App'
const EPIC = 'EPIC-Live-Demo'
const REPOSITORY = 'demo-app'
const PROJECT_MEMORY_PATH = 'applications/demo-app'
const LOOP_DURATION_MS = 9_000
const GATE_CONFIRM_DELAY_MS = 400

// Session IDs read as session-id-<ticket>-<role> — one per role per ticket,
// not one per gate. A gate suffix was tried and reverted: it made a role's
// one continuous run look like several concurrent "sessions" (one per gate
// it happened to touch), which is exactly the ambiguity a session ID is
// supposed to resolve. The gate itself already lives on the event's
// lifecycle.gate field — no need to fragment session identity to carry it.
const SESSION_PREFIX = `session-id-${TICKET_ID.toLowerCase()}`

function sessionFor(roleSlug: string): string {
  return `${SESSION_PREFIX}-${roleSlug}`
}

interface StageAction {
  t: number
  // 'pass' actions depend on their preceding 'confirm' having actually
  // resolved (a real ~400ms round trip) — the catch-up scheduler below
  // needs to know this so it doesn't collapse that gap to 40ms.
  kind: 'normal' | 'confirm' | 'pass'
  run: () => void
}

interface StageDef {
  sourceApp: string
  roleSlug: string
  stage: string
  role: string
  gate?: string
}

const LIFECYCLE: StageDef[] = [
  { sourceApp: 'Engineering Lead', roleSlug: 'eng-lead', stage: 'resolve_application', role: 'Engineering Lead' },
  { sourceApp: 'Engineering Lead', roleSlug: 'eng-lead', stage: 'understand', role: 'Engineering Lead', gate: 'understanding' },
  { sourceApp: 'Research', roleSlug: 'research', stage: 'research', role: 'Research' },
  { sourceApp: 'Architecture', roleSlug: 'arch', stage: 'architecture_review', role: 'Architecture', gate: 'architecture' },
  { sourceApp: 'Engineering Lead', roleSlug: 'eng-lead', stage: 'plan', role: 'Engineering Lead' },
  { sourceApp: 'Engineering Lead', roleSlug: 'eng-lead', stage: 'approval', role: 'Engineering Lead', gate: 'approval' },
  { sourceApp: 'Implementation', roleSlug: 'impl', stage: 'implement', role: 'Implementation' },
  { sourceApp: 'Review', roleSlug: 'review', stage: 'review', role: 'Review', gate: 'review' },
  { sourceApp: 'Testing', roleSlug: 'test', stage: 'testing', role: 'Testing', gate: 'testing' },
  { sourceApp: 'Knowledge Steward', roleSlug: 'ks', stage: 'knowledge_preservation', role: 'Knowledge Steward', gate: 'knowledge_preservation' },
  { sourceApp: 'Engineering Lead', roleSlug: 'eng-lead', stage: 'deliver', role: 'Engineering Lead' },
]

function postStageTransition(
  def: StageDef,
  sessionId: string,
  gateResult?: 'pass' | 'fail' | 'pending'
) {
  const lifecycle: Record<string, unknown> = {
    stage: def.stage,
    role: def.role,
    resolution_packet: {
      application: APPLICATION,
      epic: EPIC,
      ticket_id: TICKET_ID,
      ticket_kind: 'feature',
      repository: REPOSITORY,
      project_memory_path: PROJECT_MEMORY_PATH,
    },
  }
  if (def.gate) lifecycle.gate = def.gate
  if (gateResult) lifecycle.gate_result = gateResult

  fetch(`${SERVER_URL}/events/stage-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      harness: 'claude-code',
      source_app: def.sourceApp,
      session_id: sessionId,
      event_type: 'stage_transition',
      payload: {},
      lifecycle,
    }),
  }).catch((err) => console.error('demo: failed to send stage transition', err))
}

// The human only answers to the Engineering Lead (server-enforced, see
// index.ts's assertion on POST /hitl) — a specialist role reports its gate
// outcome to the Engineering Lead, who is the one who checks in with the
// human, not the specialist directly.
async function requestAndApproveGate(def: StageDef) {
  try {
    const res = await fetch(`${SERVER_URL}/hitl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        harness: 'claude-code',
        source_app: 'Engineering Lead',
        session_id: sessionFor('eng-lead'),
        question: `${TICKET_ID}: ${def.role} reports the ${def.gate} gate complete — confirm?`,
        ticket_id: TICKET_ID,
        gate: def.gate,
      }),
    })
    const created = await res.json()
    setTimeout(() => {
      fetch(`${SERVER_URL}/hitl/${created.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }).catch(() => {})
    }, GATE_CONFIRM_DELAY_MS)
  } catch (err) {
    console.error('demo: failed gate confirmation cycle', err)
  }
}

// Lays each stage out along the loop's timeline. Gated stages take three
// beats (pending -> confirm -> pass); ungated stages take one.
function buildActions(): StageAction[] {
  const actions: StageAction[] = []
  let t = 200

  for (const def of LIFECYCLE) {
    const sessionId = sessionFor(def.roleSlug)

    if (!def.gate) {
      const at = t
      actions.push({ t: at, kind: 'normal', run: () => postStageTransition(def, sessionId) })
      t += 500
      continue
    }

    const pendingAt = t
    const confirmAt = t + 50
    const passAt = t + 50 + GATE_CONFIRM_DELAY_MS + 100

    actions.push({
      t: pendingAt,
      kind: 'normal',
      run: () => postStageTransition(def, sessionId, 'pending'),
    })
    actions.push({
      t: confirmAt,
      kind: 'confirm',
      run: () => requestAndApproveGate(def),
    })
    actions.push({ t: passAt, kind: 'pass', run: () => postStageTransition(def, sessionId, 'pass') })

    t = passAt + 400
  }

  return actions
}

const ACTIONS = buildActions()

export function useDemoSimulator(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const timeouts: number[] = []

    // On first load, jump into the loop at a random phase instead of always
    // starting from an empty board at t=0 — makes it look like the loop was
    // already running rather than obviously restarting on every page load.
    // Actions earlier than the phase fire back-to-back in a quick catch-up
    // burst (40ms apart, preserving order) instead of waiting for their
    // normal absolute time — except a 'pass' action, which must wait for
    // its own 'confirm' to have actually completed (a real async round
    // trip): collapsing that gap to 40ms sent the pass before the server
    // had an approved confirmation on record, so it got silently rejected.
    function scheduleLoop(phaseOffset: number) {
      if (cancelled) return
      let catchUpDelay = 0
      let lastConfirmDelay = -Infinity

      for (const action of ACTIONS) {
        if (action.t < phaseOffset) {
          let delay = catchUpDelay
          if (action.kind === 'pass') {
            delay = Math.max(delay, lastConfirmDelay + GATE_CONFIRM_DELAY_MS + 200)
          }
          timeouts.push(window.setTimeout(action.run, delay))
          if (action.kind === 'confirm') lastConfirmDelay = delay
          catchUpDelay = delay + 40
        } else {
          timeouts.push(window.setTimeout(action.run, action.t - phaseOffset))
        }
      }

      timeouts.push(window.setTimeout(() => scheduleLoop(0), LOOP_DURATION_MS - phaseOffset))
    }

    scheduleLoop(Math.random() * LOOP_DURATION_MS)

    return () => {
      cancelled = true
      timeouts.forEach((t) => clearTimeout(t))
    }
  }, [enabled])
}
