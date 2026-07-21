# Claude Code adapter

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
  --application "Example App" --ticket-id ABC-9561 \
  --repository example-app --project-memory-path applications/example-app
```
