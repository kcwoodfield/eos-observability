import { SqliteEventRepository } from './db';
import type { EventQuery, NewObservabilityEvent } from './types';

const PORT = Number(process.env.PORT ?? 4100);
const DB_PATH = process.env.DB_PATH ?? 'events.db';

const repo = new SqliteEventRepository(DB_PATH);

const wsClients = new Set<any>();

function broadcast(message: object): void {
  const data = JSON.stringify(message);
  for (const client of wsClients) {
    try {
      client.send(data);
    } catch {
      wsClients.delete(client);
    }
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...init.headers },
  });
}

function parseEventQuery(url: URL): EventQuery {
  const params = url.searchParams;
  const query: EventQuery = {};

  if (params.has('harness')) query.harness = params.get('harness') as EventQuery['harness'];
  if (params.has('source_app')) query.source_app = params.get('source_app')!;
  if (params.has('session_id')) query.session_id = params.get('session_id')!;
  if (params.has('event_type')) query.event_type = params.get('event_type')!;
  if (params.has('stage')) query.stage = params.get('stage') as EventQuery['stage'];
  if (params.has('role')) query.role = params.get('role')!;
  if (params.has('since')) query.since = Number(params.get('since'));
  if (params.has('until')) query.until = Number(params.get('until'));
  if (params.has('limit')) query.limit = Number(params.get('limit'));
  if (params.has('offset')) query.offset = Number(params.get('offset'));

  return query;
}

function isValidNewEvent(body: any): body is NewObservabilityEvent {
  return (
    body &&
    typeof body.harness === 'string' &&
    typeof body.source_app === 'string' &&
    typeof body.session_id === 'string' &&
    typeof body.event_type === 'string' &&
    body.payload !== undefined &&
    typeof body.payload === 'object'
  );
}

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /events — ingest a normalized event from any harness adapter.
    // Store-and-forward: `lifecycle`, if present, is persisted verbatim.
    // No server-side stage inference or cross-event inheritance (see PRD §4/§10).
    if (url.pathname === '/events' && req.method === 'POST') {
      try {
        const body = await req.json();

        if (!isValidNewEvent(body)) {
          return json({ error: 'Missing or invalid required fields' }, { status: 400 });
        }

        const saved = repo.insert(body);
        broadcast({ type: 'event', data: saved });

        return json(saved);
      } catch (err) {
        console.error('Error processing event:', err);
        return json({ error: 'Invalid request' }, { status: 400 });
      }
    }

    // POST /events/stage-transition — thin passthrough helper (PRD §3 mechanism B).
    // Just an event whose `lifecycle` field is required; no interpretation here.
    if (url.pathname === '/events/stage-transition' && req.method === 'POST') {
      try {
        const body = await req.json();

        if (!isValidNewEvent(body) || !body.lifecycle) {
          return json(
            { error: 'Missing required fields (including lifecycle)' },
            { status: 400 }
          );
        }

        const saved = repo.insert({ ...body, event_type: body.event_type || 'stage_transition' });
        broadcast({ type: 'event', data: saved });

        return json(saved);
      } catch (err) {
        console.error('Error processing stage transition:', err);
        return json({ error: 'Invalid request' }, { status: 400 });
      }
    }

    // GET /events — server-side filtered + paginated query.
    if (url.pathname === '/events' && req.method === 'GET') {
      const page = repo.list(parseEventQuery(url));
      return json(page);
    }

    // GET /events/filter-options — distinct values for building filter UI.
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      return json(repo.filterOptions());
    }

    // WS /stream — live broadcast of newly inserted events.
    if (url.pathname === '/stream') {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
    }

    return new Response('EOS-Observability Server', {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      const { events } = repo.list({ limit: 50 });
      ws.send(JSON.stringify({ type: 'initial', data: events }));
    },
    message() {
      // No client -> server messages expected yet.
    },
    close(ws) {
      wsClients.delete(ws);
    },
  },
});

console.log(`EOS-Observability server running on http://localhost:${server.port}`);
console.log(`WebSocket stream: ws://localhost:${server.port}/stream`);
