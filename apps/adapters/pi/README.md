# pi.dev adapter — not yet built

pi's extension model is structurally different from Claude Code's hooks: pi
extensions are in-process TypeScript modules (`pi.on(eventName, handler)`),
not spawned scripts, and are placed in a project's `.pi/extensions/` or
distributed as an npm/git package — not wired through a settings file like
Claude Code's hooks.

Planned shape: a TypeScript extension that calls `fetch()` inside handlers
for pi's session/tool lifecycle events (`session_start`, `tool_execution_start`,
`tool_execution_end`, etc.), posting the same normalized envelope the Claude
Code adapter uses (`harness: "pi"`) to the EOS-Observability server.

Not implemented yet.
