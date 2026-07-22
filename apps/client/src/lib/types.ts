// Mirrors apps/server/src/types.ts.

export type Harness = 'claude-code' | 'pi'

export type TicketKind = 'bug_fix' | 'feature' | 'migration' | 'release' | 'production_incident'

export interface ResolutionPacket {
  application: string
  epic?: string
  ticket_id: string
  ticket_kind?: TicketKind
  repository: string
  project_memory_path: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

export type QualityGateResult = 'pass' | 'fail' | 'pending'

// Fixed order per eos/lifecycle/quality-gates.md — the checklist a ticket
// walks through, independent of which stage currently owns it.
export const QUALITY_GATES = [
  'understanding',
  'architecture',
  'approval',
  'review',
  'testing',
  'knowledge_preservation',
] as const

export type QualityGate = (typeof QUALITY_GATES)[number]

export interface LifecycleOverlay {
  stage?: string
  role?: string
  gate?: string
  gate_result?: QualityGateResult
  resolution_packet?: ResolutionPacket
}

export interface ObservabilityEvent {
  id: number
  harness: Harness
  source_app: string
  session_id: string
  event_type: string
  payload: Record<string, unknown>
  timestamp: number
  lifecycle?: LifecycleOverlay
  chat?: unknown[]
  summary?: string
  model_name?: string
  token_usage?: TokenUsage
}

export interface FilterOptions {
  harnesses: string[]
  source_apps: string[]
  session_ids: string[]
  event_types: string[]
}

export interface EventQuery {
  harness?: Harness
  source_app?: string
  session_id?: string
  event_type?: string
  limit?: number
}

export type HitlStatus = 'pending' | 'approved' | 'denied'

export interface HitlRequest {
  id: number
  harness: Harness
  source_app: string
  session_id: string
  question: string
  ticket_id?: string
  gate?: QualityGate
  status: HitlStatus
  response?: string
  timestamp: number
  responded_at?: number
}

// Server-maintained projection over stage-transition events — see
// apps/server/src/db.ts's upsertFromEvent. Not derived client-side, so it
// isn't limited to whatever page of events happens to be loaded.
export interface Ticket {
  ticket_id: string
  application: string
  epic?: string
  ticket_kind?: TicketKind
  repository: string
  project_memory_path: string
  stage: string
  role?: string
  gate?: string
  gate_result?: QualityGateResult
  gate_results: Partial<Record<QualityGate, QualityGateResult>>
  session_id: string
  harness: Harness
  last_ts: number
}
