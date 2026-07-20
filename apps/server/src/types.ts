// Normalized event model — the harness-agnostic envelope every adapter sends.
//
// Design rule: harness-native fields (`event_type`, `payload`) are preserved
// verbatim, never lossy-translated. The `lifecycle` overlay is additive and,
// for now, stored exactly as received — no server-side stage inference or
// cross-event inheritance yet.

export type Harness = 'claude-code' | 'pi';

export type LifecycleStage =
  | 'resolve_application'
  | 'load_project_memory'
  | 'onboard'
  | 'understand'
  | 'research'
  | 'architecture_review'
  | 'plan'
  | 'approval'
  | 'implement'
  | 'review'
  | 'testing'
  | 'knowledge_preservation'
  | 'deliver';

export type QualityGate =
  | 'understanding'
  | 'architecture'
  | 'approval'
  | 'review'
  | 'testing'
  | 'knowledge_preservation';

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
}

export interface ResolutionPacket {
  application: string;
  ticket_id: string;
  repository: string;
  project_memory_path: string;
}

export interface LifecycleOverlay {
  stage?: LifecycleStage;
  role?: string;
  gate?: QualityGate;
  gate_result?: 'pass' | 'fail' | 'pending';
  resolution_packet?: ResolutionPacket;
}

// What an adapter sends in. Server assigns id/timestamp if absent.
export interface NewObservabilityEvent {
  harness: Harness;
  source_app: string;
  session_id: string;
  event_type: string;
  payload: Record<string, any>;
  timestamp?: number;
  lifecycle?: LifecycleOverlay;
  chat?: any[];
  summary?: string;
  model_name?: string;
  // Cumulative usage for the session as of this event (not a per-event
  // delta) — a client only needs the latest event per session to know the
  // session's current total. Populated by adapters that can read it from
  // the harness's own transcript; not every harness/event will have it.
  token_usage?: TokenUsage;
}

export interface ObservabilityEvent extends NewObservabilityEvent {
  id: number;
  timestamp: number;
}

export interface EventQuery {
  harness?: Harness;
  source_app?: string;
  session_id?: string;
  event_type?: string;
  stage?: LifecycleStage;
  role?: string;
  since?: number;
  until?: number;
  limit?: number;
  offset?: number;
}

export interface EventPage {
  events: ObservabilityEvent[];
  total: number;
}

export interface FilterOptions {
  harnesses: string[];
  source_apps: string[];
  session_ids: string[];
  event_types: string[];
}
