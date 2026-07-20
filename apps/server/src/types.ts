// Normalized event model — see eos-observability/PRD.md §4 and §5.0.
//
// Design rule: harness-native fields (`event_type`, `payload`) are preserved
// verbatim, never lossy-translated. The `lifecycle` overlay is additive and,
// for now, stored exactly as received — no server-side stage inference or
// cross-event inheritance (see PRD §4 design-risk note and §10 open items).

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
