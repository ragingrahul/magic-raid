# Sprint Plan

Sprint duration: seven days.

Primary objective: deliver a reliable hackathon demo where 2-4 players fight one synchronized adaptive boss, MagicBlock is the real-time authority, AI selects constrained strategies, and the final raid result settles to Solana.

## Sprint Rules

- Work the critical path before polish.
- Do not implement out-of-scope features.
- Do not invent MagicBlock APIs.
- Keep every completed task backed by a verification command or documented manual check.
- Update `docs/PROGRESS.md` after meaningful progress.
- Update `docs/KNOWN_ISSUES.md` immediately when a blocker appears.

## Day 1 Backlog: Verify And Scaffold

Goals:
- Verify MagicBlock and Magic Router integration.
- Scaffold the minimal app workspace.
- Establish baseline checks.

Tasks:
- `MB-001`
- `APP-001`
- `QA-001`

Done when:
- MagicBlock integration path is documented.
- The app has package scripts for typecheck, lint, test, and dev.
- Baseline checks run or documented blockers exist.

## Day 2 Backlog: Real-Time Authority Proof

Goals:
- Prove one authoritative MagicBlock state transition.
- Start Solana settlement skeleton.

Tasks:
- `MB-002`
- `MB-003`
- `MB-004`
- `SOL-001`

Done when:
- A raid state can be created and updated through the verified authority path.
- The live devnet lifecycle smoke is complete or its exact blocker is recorded.
- Anchor skeleton compiles or the blocker is documented.
- Runbook records exact commands.

## Day 3 Backlog: Local Game Loop

Goals:
- Make the raid playable locally with deterministic rules.

Tasks:
- `GAME-001`
- `GAME-002`
- `GAME-003`
- `GAME-004`
- `GAME-005`

Done when:
- One local player can move, attack, damage the boss, be threatened by boss attacks, and reach a terminal state.
- Game rule tests cover the core deterministic behaviour.

## Day 4 Backlog: Multiplayer Room

Goals:
- Let 2-4 players join and see the same boss.

Tasks:
- `WEB-001`
- `WEB-002`
- `NET-001`
- `NET-002` if time allows.

Done when:
- A host creates a room code.
- Another browser joins.
- Clients receive consistent authoritative snapshots.
- Wallet connection is visible.

## Day 5 Backlog: AI Adaptation

Goals:
- Make behaviour analysis and AI strategy selection visible.

Tasks:
- `AI-001`
- `AI-002`
- `AI-003`
- `WEB-003`

Done when:
- Analytics panel detects at least clustering and dominant damage style.
- AI or fallback chooses an approved strategy.
- Boss behaviour changes visibly during the raid.

## Day 6 Backlog: Settlement And QA

Goals:
- Commit final raid result to Solana.
- Cover critical failure cases.

Tasks:
- `SOL-002`
- `SOL-003`
- `QA-002`
- `QA-003`
- `QA-004` if time allows.

Done when:
- Settlement instruction records bounded final result data.
- Frontend can submit and display settlement status.
- Unit and Anchor tests cover critical constraints.

## Day 7 Backlog: Demo Hardening

Goals:
- Rehearse the exact judging flow.
- Remove rough edges that could confuse the demo.

Tasks:
- `DEMO-001`
- `DEMO-002`
- `POLISH-001`
- `OPT-001` only if everything required is stable.

Done when:
- Demo script is rehearsed end to end.
- Fallback runbook is ready.
- Known issues are triaged as either fixed, acceptable, or blocking.

## Daily Check-In Template

Use this in `docs/PROGRESS.md`:

```md
## YYYY-MM-DD

Completed:
- ...

Verified:
- `command`

Blocked:
- ...

Next:
- ...
```

## Sprint Cut Rules

Cut these first if behind schedule:
- 5-8 player capacity testing.
- Extra animations and nonessential visual polish.
- Reconnect polish beyond basic snapshot recovery.
- Additional boss tells beyond one clear tell per strategy.

Do not cut these:
- MagicBlock authoritative proof.
- AI strategy enum validation and fallback.
- Final Solana settlement path.
- Create/join room demo flow.
- Core deterministic combat rules.
