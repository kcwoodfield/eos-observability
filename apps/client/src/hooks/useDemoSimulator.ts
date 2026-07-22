import { useEffect } from 'react'
import { SERVER_URL } from '@/lib/config'

// Drives the REAL server (not a client-side mock) through one fake ticket's
// full lifecycle, compressed into a 10s loop, so ?demo=true produces a
// short, repeatable clip to record — reuses the exact same ingest → tickets
// projection → WS broadcast pipeline a real adapter would, just compressed
// in time and looped.
const TICKET_ID = 'DEMO-007'
const APPLICATION = 'Demo App'
const EPIC = 'EPIC-Live-Demo'
const REPOSITORY = 'demo-app'
const PROJECT_MEMORY_PATH = 'applications/demo-app'
const LOOP_DURATION_MS = 10_000
const HITL_RESOLVE_DELAY_MS = 1000

interface DemoStage {
  t: number
  sourceApp: string
  sessionId: string
  stage: string
  role: string
  gate?: string
  gateResult?: 'pass' | 'fail' | 'pending'
}

const STAGES: DemoStage[] = [
  { t: 200, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'resolve_application', role: 'Engineering Lead' },
  { t: 700, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'understand', role: 'Engineering Lead', gate: 'understanding', gateResult: 'pass' },
  { t: 1400, sourceApp: 'Research', sessionId: 'demo-research', stage: 'research', role: 'Research' },
  { t: 2100, sourceApp: 'Architecture', sessionId: 'demo-arch', stage: 'architecture_review', role: 'Architecture', gate: 'architecture', gateResult: 'pass' },
  { t: 2800, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'plan', role: 'Engineering Lead' },
  { t: 3400, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'approval', role: 'Engineering Lead', gate: 'approval', gateResult: 'pending' },
  { t: 4700, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'approval', role: 'Engineering Lead', gate: 'approval', gateResult: 'pass' },
  { t: 5300, sourceApp: 'Implementation', sessionId: 'demo-impl', stage: 'implement', role: 'Implementation' },
  { t: 6000, sourceApp: 'Review', sessionId: 'demo-review', stage: 'review', role: 'Review', gate: 'review', gateResult: 'pass' },
  { t: 6700, sourceApp: 'Testing', sessionId: 'demo-test', stage: 'testing', role: 'Testing', gate: 'testing', gateResult: 'pass' },
  { t: 7400, sourceApp: 'Knowledge Steward', sessionId: 'demo-ks', stage: 'knowledge_preservation', role: 'Knowledge Steward', gate: 'knowledge_preservation', gateResult: 'pass' },
  { t: 8100, sourceApp: 'Engineering Lead', sessionId: 'demo-eng-lead', stage: 'deliver', role: 'Engineering Lead' },
]

function postStage(step: DemoStage) {
  const lifecycle: Record<string, unknown> = {
    stage: step.stage,
    role: step.role,
    resolution_packet: {
      application: APPLICATION,
      epic: EPIC,
      ticket_id: TICKET_ID,
      ticket_kind: 'feature',
      repository: REPOSITORY,
      project_memory_path: PROJECT_MEMORY_PATH,
    },
  }
  if (step.gate) lifecycle.gate = step.gate
  if (step.gateResult) lifecycle.gate_result = step.gateResult

  fetch(`${SERVER_URL}/events/stage-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      harness: 'claude-code',
      source_app: step.sourceApp,
      session_id: step.sessionId,
      event_type: 'stage_transition',
      payload: {},
      lifecycle,
    }),
  }).catch((err) => console.error('demo: failed to send stage transition', err))
}

async function runHitlCycle() {
  try {
    const res = await fetch(`${SERVER_URL}/hitl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        harness: 'claude-code',
        source_app: 'Engineering Lead',
        session_id: 'demo-eng-lead',
        question: `${TICKET_ID}: approve merging the demo changes?`,
        ticket_id: TICKET_ID,
      }),
    })
    const created = await res.json()
    setTimeout(() => {
      fetch(`${SERVER_URL}/hitl/${created.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      }).catch(() => {})
    }, HITL_RESOLVE_DELAY_MS)
  } catch (err) {
    console.error('demo: failed HITL cycle', err)
  }
}

const HITL_TRIGGER_T = 3450 // lines up with the pending "approval" transition above

export function useDemoSimulator(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const timeouts: number[] = []

    // On first load, jump into the loop at a random phase instead of always
    // starting from an empty board at t=0 — makes it look like the loop was
    // already running rather than obviously restarting on every page load.
    // Steps earlier than the phase fire back-to-back in a quick catch-up
    // burst (40ms apart, preserving order) instead of waiting for their
    // normal absolute time.
    function scheduleLoop(phaseOffset: number) {
      if (cancelled) return
      let catchUpDelay = 0

      for (const step of STAGES) {
        if (step.t < phaseOffset) {
          timeouts.push(window.setTimeout(() => postStage(step), catchUpDelay))
          catchUpDelay += 40
        } else {
          timeouts.push(window.setTimeout(() => postStage(step), step.t - phaseOffset))
        }
      }

      const hitlDelay =
        HITL_TRIGGER_T < phaseOffset ? catchUpDelay : HITL_TRIGGER_T - phaseOffset
      timeouts.push(window.setTimeout(() => runHitlCycle(), hitlDelay))

      timeouts.push(window.setTimeout(() => scheduleLoop(0), LOOP_DURATION_MS - phaseOffset))
    }

    scheduleLoop(Math.random() * LOOP_DURATION_MS)

    return () => {
      cancelled = true
      timeouts.forEach((t) => clearTimeout(t))
    }
  }, [enabled])
}
