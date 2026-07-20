// Mirrors apps/server/src/types.ts.

export type Harness = 'claude-code' | 'pi'

export interface ResolutionPacket {
  application: string
  ticket_id: string
  repository: string
  project_memory_path: string
}

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
}

export interface LifecycleOverlay {
  stage?: string
  role?: string
  gate?: string
  gate_result?: 'pass' | 'fail' | 'pending'
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
