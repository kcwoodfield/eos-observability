import { Database } from 'bun:sqlite';
import type {
  EventPage,
  EventQuery,
  FilterOptions,
  NewObservabilityEvent,
  ObservabilityEvent,
} from './types';

// Repository interface: all persistence access goes through this, not raw
// db.prepare() calls scattered through route handlers. This is what makes a
// future runtime/storage swap a contained change.
export interface EventRepository {
  insert(event: NewObservabilityEvent): ObservabilityEvent;
  list(query: EventQuery): EventPage;
  filterOptions(): FilterOptions;
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

export class SqliteEventRepository implements EventRepository {
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
}
