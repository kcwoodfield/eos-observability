# Watch Claude Code work, live

Five minutes, five copy-paste commands. At the end you'll have a browser tab
that shows every tool call, prompt, and session Claude Code runs in your
project, as it happens.

Nothing here changes how Claude Code behaves. It only watches and reports. If
the dashboard isn't running, Claude Code doesn't notice or care — it just
keeps working normally.

## Before you start

You need two small command-line tools. If you're not sure whether you have
them, run the check command — no harm in running it either way.

| Tool | Check you have it | Install if you don't |
|---|---|---|
| [Bun](https://bun.sh) | `bun --version` | `curl -fsSL https://bun.sh/install \| bash` |
| [uv](https://docs.astral.sh/uv/) | `uv --version` | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |

That's it. No accounts, no config files to hand-write yet.

## Step 1 — Turn on the dashboard

Open two terminal tabs in this repo (`eos-observability/`).

**Terminal 1 — the server** (stores and streams events):

```bash
cd apps/server && bun install && bun run start
```

**Terminal 2 — the dashboard** (the thing you'll actually look at):

```bash
cd apps/client && bun install && bun run dev
```

✅ **Checkpoint:** open **http://localhost:5273**. You should see an empty
dashboard with a green **Live** badge near the top. If it says
**Disconnected**, terminal 1 isn't running — go back and check it.

Leave both terminals running. You won't touch them again.

## Step 2 — Point it at your project

"Your project" here means whatever codebase you're actually going to run
Claude Code in — a different folder from this one, e.g.
`~/code/your-project`. That's the one you're connecting, not this repo.

1. Copy this repo's `apps/adapters/claude-code/` folder into
   `your-project/.claude/hooks/`.
2. In that copied folder, rename `settings.json.example` to
   `../settings.json` (i.e. it should end up at
   `your-project/.claude/settings.json`), and open it once to replace every
   `YOUR_ROLE` with a short name for whoever/whatever is doing the work —
   e.g. `"Engineering Lead"` or just your name. This is the label you'll see
   next to events on the dashboard.

That's the whole setup. No servers to configure, no ports to open — the
copied files already know where to send events (`localhost:4100`, the
server from Step 1).

## Step 3 — Just use Claude Code

Open a terminal in `your-project/`, start Claude Code like you always do,
and ask it to do anything — read a file, run a command, whatever's next on
your list.

✅ **Checkpoint:** switch back to the dashboard tab. Within a second or two
you should see rows appear — one per prompt, tool call, and file edit.
That's it. You're done setting up; just keep working, and the dashboard
keeps updating.

## "Wait, does this...?"

- **Slow anything down?** No — the hook fires, sends one small HTTP
  request, and gets out of the way. It never blocks a tool call.
- **Send my code anywhere?** No. It posts to `localhost:4100` on your own
  machine, nothing leaves your network unless you deliberately point
  `--server-url` somewhere else.
- **Break Claude Code if I forget to start the server?** No — every hook
  script always exits successfully even if the request fails. Worst case,
  the dashboard just doesn't get an event; Claude Code is unaffected.
- **Need to be undone later?** Delete `your-project/.claude/hooks/` and
  remove the `"hooks"` block from `your-project/.claude/settings.json`.
  There's nothing else to clean up — no installed dependencies, no global
  state.

## If nothing shows up

- **Dashboard says "Disconnected"** → Terminal 1 (the server) isn't
  running, or something else is already using port 4100.
- **You did Step 2 but no rows appear** → Check `your-project/.claude/settings.json`
  is valid JSON (a stray comma will silently break it) and that you
  actually renamed the `.example` file, not just edited it in place.
- **`uv: command not found`** → Re-run the install command from the table
  above, then open a new terminal tab (so your `PATH` picks it up).
- **Still stuck** → full details on every file and flag:
  [`apps/adapters/claude-code/README.md`](../apps/adapters/claude-code/README.md).

## Optional, later: tagging work with EOS stages

If you're following [EOS](https://github.com/kcwoodfield/eos)'s lifecycle
(Research → Plan → Implement → Review, etc.), you can additionally mark
*which stage* a session is in, so the dashboard shows not just "what
happened" but "where this ticket stands." This is a separate, optional
step — skip it entirely if you just want the live event view from Step 3.
See [`apps/adapters/claude-code/README.md#stage-transitions`](../apps/adapters/claude-code/README.md#stage-transitions).
