# 上游反馈文案（PI-Desktop）

> 本文件是给用户的投稿底稿，非 issue 原文一处粘贴即可——按下方三案拆开发。英文正文可直接复制；发之前把版本号核对成当时的最新版。
> 建议去处：PI-Desktop 官方仓库 Issues（feature request）。

---

## Issue A — Extension/hooks API for the desktop host（最核心的一案）

**Title:** Desktop host: please expose an extension API (event hooks / programmatic message injection)

**Body:**

Context: I run long agentic sessions (2h+) on PI-Desktop with a CPA-proxied Gemini 3.8 Flash. Three failure modes recur, and all of them are only fixable from *outside* the app today:

1. **Tool-failure death spirals.** One session (4 user rounds, 135 min) hit a turn where the agent re-ran a failing verification script **48 times (38 failures)** and burned ~60 minutes before an app-level timeout cut it off. Nothing in the host notices "same tool call, same args, 3rd consecutive failure".
2. **Context overshoot.** Same session: context median 338k tokens, peak ~500k. Model instruction-following measurably degrades long before that (in our measurements, rules that were verbatim in context were followed ~0% at 300k+: 69/71 reads still used tiny windows, 43 Bash calls with zero output filtering).
3. **Provider error storms.** Repeated per-turn provider errors continued until the user manually switched models.

What we found while trying to fix this in-app:

- `~/.pi/agent/settings.json` has a `packages` array, but the desktop host does **not** consume it (verified: installed `pi-loop-breaker` v0.2.0, npm install OK, no load after restart; runtime log shows no extension loading). Existing pi-CLI extensions (pi-loop-breaker, pi-condense) cannot be used with the desktop app.
- No `pi.on(...)`, `sendUserMessage`, or `session_before_compact`-style hooks exist in the desktop host (searched the shipped asar: 0 hits).

**Ask:** expose a minimal extension surface on the desktop host, e.g.:

- `session.on('toolResult', …)` / `session.on('turnEnd', …)` events,
- a way to inject a user-visible notification (toast) or a programmatic user message when a rule fires,
- optionally `session_before_compact` (pi CLI already has this concept).

**Workaround we shipped** (happy to share): an external Node watchdog that tails `~/.pi-desktop/sessions/<id>.jsonl` and polls `pi.sqlite` (read-only) for 5 rules — same-signature failure streak ≥3, context >250k, single turn running >25 min, >45 tool calls in one turn, ≥3 error turns per session in 15 min — and fires Windows toasts. It works, but it's polling-based and can't intervene, only notify. A first-class hook API would let this be reliable and in-app.

---

## Issue B — Configurable auto-compaction threshold

**Title:** Make the auto-compaction threshold configurable (or adaptive)

**Body:**

On a 1M-token context window, auto-compaction currently triggers at ~92% (≈920k). But effective attention degrades much earlier: our measurements on Gemini 3.8 Flash show instruction-following collapse in the 200–300k range (rules verbatim in context, followed ~0%; community consensus for this model family is 50k–300k effective context; Codex officially summarizes at ~272k). The result is a large "dead zone" — 250k to 920k — where the session looks healthy but quality is silently gone.

We also tried `compactAfterTokensMode` / `compactAfterTokensRatio` in `~/.pi/agent/settings.json`: **not recognized** by pi-coding-agent 0.87.1 nor by the desktop host's embedded core (0 hits in code search; the keys appear to be from the 1.x CLI line).

**Ask:**

- Expose compaction trigger as a setting (absolute tokens or %), per model if possible.
- Bonus: compact *before* the context is at its worst — compaction quality depends on the model being asked to summarize, and at 92% it's the most degraded model doing the summarizing.

**Workaround:** manual handoff prompts at 250k (we wrote the discipline into a skill + external watchdog alert). Configurable threshold would remove the manual step.

---

## Issue C — Tool output growth control (auto-summarize / cap persistent tool results)

**Title:** Long sessions: cap or summarize persisted tool outputs (43 Bash dumps → 500k context)

**Body:**

In a post-mortem of one 135-minute session, the dominant context consumer was **unfiltered Bash stdout: 43 calls with no filtering**, while actual file content read into context was only ~7k tokens. Every tool result persists forever in the conversation, so each untrimmed output taxes *all subsequent turns* (a "knapsack death spiral": one wasteful read adds weight to every later request).

The agent-side fix (prompt rules like "pipe through Select-Object") demonstrably stops working in long contexts — the rules were in-context and still followed ~0% past ~300k.

**Ask (host-side, any subset):**

1. Configurable per-tool-result size cap with automatic truncation marker (`[truncated N lines, rerun with narrower query]`).
2. Optional auto-summarization of tool results older than K turns (Bash/Read outputs age out into gist-style stubs; full text stays on disk in the session JSONL, retrievable on demand).
3. A context-audit surface (per-category token breakdown) so users can see what's eating the window.

All three would materially extend usable session length for long agentic runs.
