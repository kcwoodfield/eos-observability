import { Database } from 'bun:sqlite';
import type {
  EventPage,
  EventQuery,
  FilterOptions,
  HitlRequest,
  NewHitlRequest,
  NewObservabilityEvent,
  ObservabilityEvent,
  Ticket,
} from './types';

// Repository interface: all persistence access goes through this, not raw
// db.prepare() calls scattered through route handlers. This is what makes a
// future runtime/storage swap a contained change.
export interface EventRepository {
  insert(event: NewObservabilityEvent): ObservabilityEvent;
  list(query: EventQuery): EventPage;
  filterOptions(): FilterOptions;
}

export interface HitlRepository {
  create(req: NewHitlRequest): HitlRequest;
  respond(id: number, status: 'approved' | 'denied', response?: string): HitlRequest | null;
  get(id: number): HitlRequest | null;
  listPending(): HitlRequest[];
}

export interface TicketRepository {
  // Folds a just-inserted event's lifecycle stage-transition into the
  // tickets projection. No-op (returns null) for events with no
  // stage/resolution_packet — i.e. almost every regular tool event.
  upsertFromEvent(event: ObservabilityEvent): Ticket | null;
  listTickets(): Ticket[];
}

function rowToEvent(row: any): ObservabilityEvent {
  return {
    id: row.id,
    harness: row.harness,
    source_app: row.source_app,
    session_id: row.session_id,
    event_type: row.event_type,
    payload: JSON.parse(row.payload),
    timestamp: row.timestamp,
    lifecycle: row.lifecycle ? JSON.parse(row.lifecycle) : undefined,
    chat: row.chat ? JSON.parse(row.chat) : undefined,
    summary: row.summary || undefined,
    model_name: row.model_name || undefined,
    token_usage: row.token_usage ? JSON.parse(row.token_usage) : undefined,
  };
}

function rowToHitlRequest(row: any): HitlRequest {
  return {
    id: row.id,
    harness: row.harness,
    source_app: row.source_app,
    session_id: row.session_id,
    question: row.question,
    ticket_id: row.ticket_id || undefined,
    status: row.status,
    response: row.response || undefined,
    timestamp: row.timestamp,
    responded_at: row.responded_at || undefined,
  };
}

function rowToTicket(row: any): Ticket {
  return {
    ticket_id: row.ticket_id,
    application: row.application,
    epic: row.epic || undefined,
    ticket_kind: row.ticket_kind || undefined,
    repository: row.repository,
    project_memory_path: row.project_memory_path,
    stage: row.stage,
    role: row.role || undefined,
    gate: row.gate || undefined,
    gate_result: row.gate_result || undefined,
    gate_results: JSON.parse(row.gate_results || '{}'),
    session_id: row.session_id,
    harness: row.harness,
    last_ts: row.last_ts,
  };
}

export class SqliteEventRepository implements EventRepository, HitlRepository, TicketRepository {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        harness TEXT NOT NULL,
        source_app TEXT NOT NULL,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        lifecycle TEXT,
        chat TEXT,
        summary TEXT,
        model_name TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    const columns = this.db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
    if (!columns.some((c) => c.name === 'token_usage')) {
      this.db.exec('ALTER TABLE events ADD COLUMN token_usage TEXT');
    }

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_harness ON events(harness)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_source_app ON events(source_app)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS hitl_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        harness TEXT NOT NULL,
        source_app TEXT NOT NULL,
        session_id TEXT NOT NULL,
        question TEXT NOT NULL,
        ticket_id TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        response TEXT,
        timestamp INTEGER NOT NULL,
        responded_at INTEGER
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_hitl_status ON hitl_requests(status)');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id TEXT PRIMARY KEY,
        application TEXT NOT NULL,
        epic TEXT,
        ticket_kind TEXT,
        repository TEXT NOT NULL,
        project_memory_path TEXT NOT NULL,
        stage TEXT NOT NULL,
        role TEXT,
        gate TEXT,
        gate_result TEXT,
        gate_results TEXT NOT NULL DEFAULT '{}',
        session_id TEXT NOT NULL,
        harness TEXT NOT NULL,
        last_ts INTEGER NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_tickets_application ON tickets(application)');
  }

  create(req: NewHitlRequest): HitlRequest {
    const timestamp = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO hitl_requests (harness, source_app, session_id, question, ticket_id, status, timestamp)
      VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `);
    const result = stmt.run(
      req.harness,
      req.source_app,
      req.session_id,
      req.question,
      req.ticket_id ?? null,
      timestamp
    );

    return {
      ...req,
      id: result.lastInsertRowid as number,
      status: 'pending',
      timestamp,
    };
  }

  respond(id: number, status: 'approved' | 'denied', response?: string): HitlRequest | null {
    const respondedAt = Date.now();
    this.db
      .prepare(
        `UPDATE hitl_requests SET status = ?, response = ?, responded_at = ? WHERE id = ? AND status = 'pending'`
      )
      .run(status, response ?? null, respondedAt, id);

    return this.get(id);
  }

  get(id: number): HitlRequest | null {
    const row = this.db.prepare('SELECT * FROM hitl_requests WHERE id = ?').get(id) as any;
    return row ? rowToHitlRequest(row) : null;
  }

  listPending(): HitlRequest[] {
    const rows = this.db
      .prepare(`SELECT * FROM hitl_requests WHERE status = 'pending' ORDER BY timestamp ASC`)
      .all() as any[];
    return rows.map(rowToHitlRequest);
  }

  insert(event: NewObservabilityEvent): ObservabilityEvent {
    const timestamp = event.timestamp ?? Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO events (harness, source_app, session_id, event_type, payload, lifecycle, chat, summary, model_name, token_usage, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.harness,
      event.source_app,
      event.session_id,
      event.event_type,
      JSON.stringify(event.payload),
      event.lifecycle ? JSON.stringify(event.lifecycle) : null,
      event.chat ? JSON.stringify(event.chat) : null,
      event.summary ?? null,
      event.model_name ?? null,
      event.token_usage ? JSON.stringify(event.token_usage) : null,
      timestamp
    );

    return {
      ...event,
      id: result.lastInsertRowid as number,
      timestamp,
    };
  }

  list(query: EventQuery): EventPage {
    const conditions: string[] = [];
    const params: any[] = [];

    if (query.harness) {
      conditions.push('harness = ?');
      params.push(query.harness);
    }
    if (query.source_app) {
      conditions.push('source_app = ?');
      params.push(query.source_app);
    }
    if (query.session_id) {
      conditions.push('session_id = ?');
      params.push(query.session_id);
    }
    if (query.event_type) {
      conditions.push('event_type = ?');
      params.push(query.event_type);
    }
    if (query.stage) {
      conditions.push("json_extract(lifecycle, '$.stage') = ?");
      params.push(query.stage);
    }
    if (query.role) {
      conditions.push("json_extract(lifecycle, '$.role') = ?");
      params.push(query.role);
    }
    if (query.ticket_id) {
      conditions.push("json_extract(lifecycle, '$.resolution_packet.ticket_id') = ?");
      params.push(query.ticket_id);
    }
    if (query.since !== undefined) {
      conditions.push('timestamp >= ?');
      params.push(query.since);
    }
    if (query.until !== undefined) {
      conditions.push('timestamp <= ?');
      params.push(query.until);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const total = (
      this.db.prepare(`SELECT COUNT(*) as count FROM events ${where}`).get(...params) as {
        count: number;
      }
    ).count;

    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as any[];

    return {
      events: rows.map(rowToEvent).reverse(),
      total,
    };
  }

  filterOptions(): FilterOptions {
    const harnesses = this.db
      .prepare('SELECT DISTINCT harness FROM events ORDER BY harness')
      .all() as { harness: string }[];
    const sourceApps = this.db
      .prepare('SELECT DISTINCT source_app FROM events ORDER BY source_app')
      .all() as { source_app: string }[];
    const sessionIds = this.db
      .prepare('SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 100')
      .all() as { session_id: string }[];
    const eventTypes = this.db
      .prepare('SELECT DISTINCT event_type FROM events ORDER BY event_type')
      .all() as { event_type: string }[];

    return {
      harnesses: harnesses.map((r) => r.harness),
      source_apps: sourceApps.map((r) => r.source_app),
      session_ids: sessionIds.map((r) => r.session_id),
      event_types: eventTypes.map((r) => r.event_type),
    };
  }

  private getTicket(ticketId: string): Ticket | null {
    const row = this.db.prepare('SELECT * FROM tickets WHERE ticket_id = ?').get(ticketId) as any;
    return row ? rowToTicket(row) : null;
  }

  upsertFromEvent(event: ObservabilityEvent): Ticket | null {
    const lifecycle = event.lifecycle;
    const packet = lifecycle?.resolution_packet;
    if (!lifecycle?.stage || !packet?.ticket_id) return null;

    const existing = this.getTicket(packet.ticket_id);
    const gateResults = { ...(existing?.gate_results ?? {}) };
    if (lifecycle.gate && lifecycle.gate_result) {
      gateResults[lifecycle.gate] = lifecycle.gate_result;
    }

    // Gate results always accumulate regardless of arrival order; "current"
    // fields (stage/role/session/harness) only move forward in time, so an
    // out-of-order/backfilled event can't regress what's currently shown.
    const isNewer = !existing || event.timestamp >= existing.last_ts;

    const ticket: Ticket = {
      ticket_id: packet.ticket_id,
      application: packet.application,
      epic: packet.epic ?? existing?.epic,
      ticket_kind: packet.ticket_kind ?? existing?.ticket_kind,
      repository: packet.repository,
      project_memory_path: packet.project_memory_path,
      stage: isNewer ? lifecycle.stage : existing!.stage,
      role: isNewer ? lifecycle.role : existing?.role,
      gate: isNewer ? lifecycle.gate : existing?.gate,
      gate_result: isNewer ? lifecycle.gate_result : existing?.gate_result,
      gate_results: gateResults,
      session_id: isNewer ? event.session_id : existing!.session_id,
      harness: isNewer ? event.harness : existing!.harness,
      last_ts: isNewer ? event.timestamp : existing!.last_ts,
    };

    this.db
      .prepare(
        `
      INSERT INTO tickets (ticket_id, application, epic, ticket_kind, repository, project_memory_path, stage, role, gate, gate_result, gate_results, session_id, harness, last_ts)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(ticket_id) DO UPDATE SET
        application = excluded.application,
        epic = excluded.epic,
        ticket_kind = excluded.ticket_kind,
        repository = excluded.repository,
        project_memory_path = excluded.project_memory_path,
        stage = excluded.stage,
        role = excluded.role,
        gate = excluded.gate,
        gate_result = excluded.gate_result,
        gate_results = excluded.gate_results,
        session_id = excluded.session_id,
        harness = excluded.harness,
        last_ts = excluded.last_ts
    `
      )
      .run(
        ticket.ticket_id,
        ticket.application,
        ticket.epic ?? null,
        ticket.ticket_kind ?? null,
        ticket.repository,
        ticket.project_memory_path,
        ticket.stage,
        ticket.role ?? null,
        ticket.gate ?? null,
        ticket.gate_result ?? null,
        JSON.stringify(ticket.gate_results),
        ticket.session_id,
        ticket.harness,
        ticket.last_ts
      );

    return ticket;
  }

  listTickets(): Ticket[] {
    const rows = this.db.prepare('SELECT * FROM tickets ORDER BY last_ts DESC').all() as any[];
    return rows.map(rowToTicket);
  }
}
