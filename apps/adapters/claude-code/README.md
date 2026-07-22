# Claude Code adapter

> New to this? [`docs/claude-code-quickstart.md`](../../../docs/claude-code-quickstart.md)
> is the plain-language, step-by-step version. This file is the full reference.

Implements the harness adapter contract for Claude Code: translates Claude Code
hook payloads into the normalized `ObservabilityEvent` envelope and POSTs them
to the EOS-Observability server.

Simpler than the reference app's `.claude/hooks/`: one sender (`send_event.py`)
covers every event type uniformly instead of a dedicated script per event,
since per-event local JSON logging is redundant now that the server is the
system of record. Only `pre_tool_use.py` stays separate, because it has real
logic (blocking dangerous commands / `.env` access), not just logging.

## Files

- `send_event.py` — reads a hook payload from stdin, wraps it in the envelope, POSTs to `/events`. Never blocks Claude Code (always exits 0).
- `pre_tool_use.py` — safety gate for `PreToolUse`; blocks dangerous `rm` commands and `.env` file access (exit code 2 blocks the tool call).
- `send_stage_transition.py` — explicit lifecycle stage announcer. Not a hook — invoke directly (e.g. via the Bash tool) at eos/ lifecycle stage boundaries.
- `request_approval.py` — human-in-the-loop request. Not a hook — invoke directly at a stop-and-escalate point (e.g. the EOS Approval gate); blocks until a human responds from the dashboard, or times out.
- `utils/model_extractor.py` — pulls the model name out of a transcript, no LLM calls.
- `settings.json.example` — hook wiring to copy into a project's `.claude/settings.json`.

## Setup

Requires [Astral uv](https://docs.astral.sh/uv/) (`uv run --script` executes these with no separate install step).

1. Copy this directory's contents into `.claude/hooks/` in the project you want
   to observe — a separate codebase from this repo (e.g. `~/code/your-project`,
   not `~/code/eos-observability`). Once copied, these scripts are self-contained
   and have no path dependency back on this repo.
2. Copy `settings.json.example` into `.claude/settings.json`, replacing `YOUR_ROLE`
   with the identity of the role/agent running in that project — this is what lets
   the server resolve `role` from `source_app`.
3. Start the EOS-Observability server (`apps/server`, default `http://localhost:4100`).
   Override with `--server-url` on any script if it runs elsewhere.

## Stage transitions

Not wired into `settings.json` — invoke explicitly, e.g.:

```bash
uv run send_stage_transition.py \
  --source-app "Engineering Lead" --session-id "$SESSION_ID" \
  --stage research --role Research \
  --application "Example App" --ticket-id ABC-9561 --ticket-kind feature \
  --repository example-app --project-memory-path applications/example-app
```

`--ticket-kind` (`bug_fix`/`feature`/`migration`/`release`/`production_incident`)
and `--epic` (free text, e.g. `"EPIC-Auth-Migration"`) are both optional —
per eos/'s Application Mapping Standard, they drive the dashboard's Working
Stage panel (Application → Epic → Ticket) but aren't required for a
transition to be valid.

## Human-in-the-loop (approval / escalation)

For the eos/ Approval gate — or any point where the rule is "stop and
escalate" — invoke `request_approval.py` directly. It blocks until someone
responds from the dashboard's inbox (or the timeout elapses), then exits
`0` (approved) or non-zero (denied/timed out) so the calling agent can act
on the result:

```bash
uv run request_approval.py \
  --source-app "Engineering Lead" --session-id "$SESSION_ID" \
  --question "Ready to merge PR #42 into main — approve?" \
  --ticket-id ABC-9561
```

Unlike the reference app's HITL (which had the *server* dial an outbound
connection back to a port the agent opened), this script itself holds the
open connection via long-polling — nothing needs to be reachable on the
agent's side.
