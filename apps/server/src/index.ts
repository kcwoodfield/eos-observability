import { SqliteEventRepository } from './db';
import type { EventQuery, NewObservabilityEvent } from './types';

const PORT = Number(process.env.PORT ?? 4100);
const DB_PATH = process.env.DB_PATH ?? 'events.db';

// The sole orchestrator role per eos/roles/Engineering Lead.md — the only
// role that talks to the human. Specialist roles report to it, not to the
// human directly (see the assertion on POST /hitl below).
const ORCHESTRATOR_ROLE = 'Engineering Lead';

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

// HITL long-poll: the requester (agent-side script) blocks on GET
// /hitl/:id/wait instead of the server dialing back out to it (PRD §6's
// fix for the reference app's fragile reverse connection). A pending
// request's resolvers live here in memory only — fine for a single-process
// server, and a restart just means any in-flight waiter times out and the
// caller can re-poll.
const hitlWaiters = new Map<number, Array<() => void>>();

function notifyHitlWaiters(id: number): void {
  const waiters = hitlWaiters.get(id);
  if (!waiters) return;
  hitlWaiters.delete(id);
  for (const resolve of waiters) resolve();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (params.has('ticket_id')) query.ticket_id = params.get('ticket_id')!;
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
  // Bun's default per-connection idle timeout is 10s, which kills the HITL
  // long-poll (GET /hitl/:id/wait) mid-request — found by actually running
  // request_approval.py against the server, not by inspection. 255 is Bun's
  // max (idleTimeout is a uint8 seconds field); the wait endpoint clamps its
  // own timeout well under this.
  idleTimeout: 255,

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

        const ticket = repo.upsertFromEvent(saved);
        if (ticket) broadcast({ type: 'ticket', data: ticket });

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

        // Assertion: a gate can only be marked passed once a human has
        // actually confirmed it via HITL — self-reporting "pass" isn't
        // sufficient. Fail/pending need no confirmation; only an assertion
        // of success does.
        const { gate, gate_result, resolution_packet } = body.lifecycle;
        if (gate && gate_result === 'pass') {
          const ticketId = resolution_packet?.ticket_id;
          if (!ticketId || !repo.hasApprovedGateConfirmation(ticketId, gate)) {
            return json(
              {
                error: `Gate "${gate}" cannot be marked passed without an approved HITL confirmation for this ticket. Request one via POST /hitl (or request_approval.py --gate ${gate}) first.`,
              },
              { status: 400 }
            );
          }
        }

        const saved = repo.insert({ ...body, event_type: body.event_type || 'stage_transition' });
        broadcast({ type: 'event', data: saved });

        const ticket = repo.upsertFromEvent(saved);
        if (ticket) broadcast({ type: 'ticket', data: ticket });

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

    // GET /tickets — the tickets projection (Lifecycle Board / Working
    // Stage panel), independent of the events page size/window.
    if (url.pathname === '/tickets' && req.method === 'GET') {
      return json({ tickets: repo.listTickets() });
    }

    // GET /events/filter-options — distinct values for building filter UI.
    if (url.pathname === '/events/filter-options' && req.method === 'GET') {
      return json(repo.filterOptions());
    }

    // POST /hitl — agent-side script opens a request (e.g. at the EOS
    // Approval gate) and then blocks on GET /hitl/:id/wait for the answer.
    if (url.pathname === '/hitl' && req.method === 'POST') {
      try {
        const body: any = await req.json();
        if (
          !body ||
          typeof body.harness !== 'string' ||
          typeof body.source_app !== 'string' ||
          typeof body.session_id !== 'string' ||
          typeof body.question !== 'string'
        ) {
          return json({ error: 'Missing or invalid required fields' }, { status: 400 });
        }

        // Assertion: the human answers only to the Engineering Lead —
        // specialist roles check in with the Engineering Lead (who reports
        // the outcome to the human), not with the human directly. Mirrors
        // the same server-enforced-not-self-reported approach as the gate
        // assertion above.
        if (body.source_app !== ORCHESTRATOR_ROLE) {
          return json(
            {
              error: `Only "${ORCHESTRATOR_ROLE}" may open a HITL request — "${body.source_app}" should report its outcome to ${ORCHESTRATOR_ROLE}, who requests the human's confirmation.`,
            },
            { status: 400 }
          );
        }

        const saved = repo.create({
          harness: body.harness,
          source_app: body.source_app,
          session_id: body.session_id,
          question: body.question,
          ticket_id: body.ticket_id,
          gate: body.gate,
        });
        broadcast({ type: 'hitl_created', data: saved });

        return json(saved);
      } catch (err) {
        console.error('Error creating HITL request:', err);
        return json({ error: 'Invalid request' }, { status: 400 });
      }
    }

    // GET /hitl?status=pending — list requests, for the inbox UI.
    if (url.pathname === '/hitl' && req.method === 'GET') {
      return json({ requests: repo.listPending() });
    }

    // GET /hitl/:id/wait — long-poll. Blocks until a human responds or the
    // timeout elapses, then returns the request's current state either way.
    const waitMatch = url.pathname.match(/^\/hitl\/(\d+)\/wait$/);
    if (waitMatch && req.method === 'GET') {
      const id = Number(waitMatch[1]);
      // Bun's per-connection idleTimeout (set below) caps how long any single
      // request can stay open — clamp under that, with margin, rather than
      // the timeout param's nominal max.
      const timeoutMs = Math.min(Number(url.searchParams.get('timeout') ?? 60_000), 240_000);

      let current = repo.get(id);
      if (!current) return json({ error: 'Not found' }, { status: 404 });

      if (current.status === 'pending') {
        await Promise.race([
          new Promise<void>((resolve) => {
            const waiters = hitlWaiters.get(id) ?? [];
            waiters.push(resolve);
            hitlWaiters.set(id, waiters);
          }),
          sleep(timeoutMs),
        ]);
        current = repo.get(id) ?? current;
      }

      return json(current);
    }

    // POST /hitl/:id/respond — the human's answer, from the dashboard UI.
    const respondMatch = url.pathname.match(/^\/hitl\/(\d+)\/respond$/);
    if (respondMatch && req.method === 'POST') {
      const id = Number(respondMatch[1]);
      try {
        const body: any = await req.json();
        if (body?.status !== 'approved' && body?.status !== 'denied') {
          return json({ error: 'status must be "approved" or "denied"' }, { status: 400 });
        }

        const updated = repo.respond(id, body.status, body.response);
        if (!updated) return json({ error: 'Not found' }, { status: 404 });

        notifyHitlWaiters(id);
        broadcast({ type: 'hitl_responded', data: updated });

        return json(updated);
      } catch (err) {
        console.error('Error responding to HITL request:', err);
        return json({ error: 'Invalid request' }, { status: 400 });
      }
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
      ws.send(JSON.stringify({ type: 'hitl_initial', data: repo.listPending() }));
      ws.send(JSON.stringify({ type: 'tickets_initial', data: repo.listTickets() }));
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
