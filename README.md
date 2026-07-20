# EOS-Observability

Real-time observability for AI-assisted engineering work, built around the
workflow defined in [`eos/`](../eos) — stages, roles, quality gates, and the
resolution packet — rather than as a generic tool-call logger. Tracks
multiple CLI coding harnesses (Claude Code, pi.dev) through one normalized
event model.

![EOS-Observability dashboard](docs/images/dashboard.png)

## Architecture

```
Harness (Claude Code / pi.dev) → adapter → HTTP POST → Bun server → SQLite → WebSocket → React client
```

- **`apps/server`** — Bun + `bun:sqlite`. Ingests events, serves them
  filtered/paginated, broadcasts live over WebSocket.
- **`apps/client`** — Vite + React + shadcn/ui. Live event stream and
  session activity timeline.
- **`apps/adapters/claude-code`** — Python scripts run via `uv` from Claude
  Code's hook system.
- **`apps/adapters/pi`** — TypeScript extension for pi.dev (in progress).

## Quick start

Requires [Bun](https://bun.sh).

```bash
# Terminal 1 — server (http://localhost:4100)
cd apps/server
bun install
bun run start

# Terminal 2 — client (http://localhost:5273)
cd apps/client
bun install
bun run dev
```

Open `http://localhost:5273`. With nothing connected yet the event stream
will be empty — set up a harness below to send it data.

---

## How to: connect this repo's own Claude Code session

Useful while developing EOS-Observability itself, so you can watch your own
session's activity in the dashboard as you work.

1. Copy the adapter into this repo's own hook directory:
   ```bash
   mkdir -p .claude/hooks
   cp apps/adapters/claude-code/*.py .claude/hooks/
   cp -r apps/adapters/claude-code/utils .claude/hooks/
   cp apps/adapters/claude-code/settings.json.example .claude/settings.json
   ```
2. In `.claude/settings.json`, replace every `YOUR_ROLE` with an identity for
   this session — e.g. `eos-observability-dev`.
3. Make sure the server (above) is running on `http://localhost:4100` — it's
   the default `--server-url` every script falls back to.
4. Start (or restart) Claude Code in this repo. Hook events now appear live
   in the dashboard as you work.

## How to: connect a different project's Claude Code session

For watching Claude Code activity in any other repository.

1. Copy the adapter into that project:
   ```bash
   mkdir -p /path/to/your-project/.claude/hooks
   cp apps/adapters/claude-code/*.py /path/to/your-project/.claude/hooks/
   cp -r apps/adapters/claude-code/utils /path/to/your-project/.claude/hooks/
   cp apps/adapters/claude-code/settings.json.example /path/to/your-project/.claude/settings.json
   ```
2. In that project's `.claude/settings.json`, replace `YOUR_ROLE` with an
   identity for that project/session (e.g. its EOS role, or the project
   name).
3. If the EOS-Observability server isn't running on the same machine at the
   default `http://localhost:4100`, add `--server-url http://HOST:PORT/events`
   to each `send_event.py` line in `settings.json`.
4. Start Claude Code in that project. Its events now stream into the same
   dashboard, distinguishable by `source_app` and `harness: claude-code`.

See [`apps/adapters/claude-code/README.md`](apps/adapters/claude-code/README.md)
for what each script does, and how to announce eos/ lifecycle stage
transitions explicitly (`send_stage_transition.py`).

## How to: connect a pi.dev session

**Status: adapter not yet built** — pi.dev's extension model is confirmed:
in-process TypeScript modules via `pi.on()`, not spawned scripts like Claude
Code's — but the actual `apps/adapters/pi` extension is still on the to-do
list. This is the intended setup once it lands:

1. Copy (or `npm`/git-install) the extension into pi's project-local
   extension directory:
   ```bash
   mkdir -p .pi/extensions
   cp apps/adapters/pi/eos-observability.ts .pi/extensions/
   ```
2. Configure the target server URL (env var or a constant in the extension
   file — default will be `http://localhost:4100/events`).
3. Start (or `/reload`) pi in that project. The extension's `pi.on(...)`
   handlers POST normalized events (`harness: "pi"`) to the same server and
   dashboard as Claude Code.
