# Roadmap

This roadmap is optimized for a seven-day solo hackathon build. The critical path is:

MagicBlock proof -> local game -> multiplayer -> boss engine -> AI -> settlement -> polish -> demo.

## Milestones

| Milestone | Target | Required tasks | Demo value |
| --- | --- | --- | --- |
| M0: Bootstrap planning | Day 0 | `PLAN-001`, `PLAN-002` | Agents have aligned docs, tasks, and prompts |
| M1: Verified scaffold | Day 1 | `MB-001`, `APP-001`, `QA-001` | Repo can build and test locally |
| M2: MagicBlock proof | Day 2 | `MB-002`, `MB-003`, `MB-004`, `SOL-001` | One authoritative state transition exists |
| M3: Local playable raid | Day 3 | `GAME-001`, `GAME-002`, `GAME-003`, `GAME-004`, `GAME-005` | One browser can fight a deterministic boss |
| M4: Multiplayer sync | Day 4 | `NET-001`, `NET-002`, `WEB-001`, `WEB-002` | 2-4 players see the same boss |
| M5: Adaptive boss | Day 5 | `AI-001`, `AI-002`, `AI-003`, `WEB-003` | Analytics panel triggers visible strategy changes |
| M6: Settlement and authority hardening | Day 6 | `NET-003`, `SOL-002`, `SOL-003`, `QA-002`, `QA-003` | Final result commits to Solana and core tests pass |
| M7: Demo hardening | Day 7 | `DEMO-001`, `DEMO-002`, `POLISH-001` | Repeatable live demo with fallback plan |

## Day Plan

### Day 1: Verify And Scaffold

Primary outcome: a minimal repo that can run type checks and tests.

Tasks:
- `MB-001`: verify MagicBlock and Magic Router integration details.
- `APP-001`: scaffold the Next.js, TypeScript, Tailwind, Phaser, and Vitest workspace.
- `QA-001`: create baseline verification commands.

Stop early if MagicBlock docs reveal a required architecture change. Update `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` before coding further.

### Day 2: MagicBlock And Solana Skeleton

Primary outcome: one low-latency authoritative state transition and one Anchor skeleton.

Tasks:
- `MB-002`: create a minimal MagicBlock-authoritative raid state spike.
- `MB-003`: document local/devnet MagicBlock runbook.
- `MB-004`: run the live MagicBlock devnet lifecycle smoke.
- `SOL-001`: scaffold the settlement program and first Anchor test.

Stop early if the MagicBlock proof cannot run locally or against a supported dev environment. Use the fallback sync path only for UI progress, and keep the blocker visible.

### Day 3: Local Game

Primary outcome: one player can move, attack, and complete a short deterministic boss fight locally.

Tasks:
- `GAME-001`: define shared game types and Zod schemas.
- `GAME-002`: implement Phaser arena, movement, and rendering.
- `GAME-003`: implement three class normal attacks and specials.
- `GAME-004`: implement deterministic boss phases and attacks.

Do not add extra classes, maps, bosses, inventory, or economy.

### Day 4: Multiplayer Sync

Primary outcome: 2-4 browser clients see the same authoritative raid.

Tasks:
- `NET-001`: connect client input and authoritative snapshots.
- `NET-002`: add snapshot recovery and simple reconnect handling.
- `WEB-001`: create room code flow.
- `WEB-002`: add wallet connect UI.

If perfect synchronization becomes expensive, prefer stable snapshots and visible authoritative correction.

Carry-forward:
- `NET-003` is scheduled for Day 6 to replace or augment the Day 4 room authority with MagicBlock-routed gameplay-critical mutations.

### Day 5: AI Adaptation

Primary outcome: the boss visibly changes behaviour based on team analytics.

Tasks:
- `AI-001`: implement analytics summary.
- `AI-002`: implement structured LLM strategy selection with Zod validation.
- `AI-003`: apply approved strategies with deterministic fallbacks.
- `WEB-003`: expose analytics and strategy panel.

If the LLM API fails, the deterministic fallback must still produce the demo moment.

### Day 6: Settlement And Verification

Primary outcome: final raid result settles to Solana and tests cover critical rules.

Tasks:
- `NET-003`: route room gameplay authority through MagicBlock.
- `SOL-002`: implement final settlement instruction.
- `SOL-003`: connect frontend/backend settlement flow.
- `QA-002`: add game and AI unit tests.
- `QA-003`: add Anchor tests for settlement.

If settlement is blocked, preserve a clearly logged transaction-building path and record the blocker in `docs/KNOWN_ISSUES.md`.

### Day 7: Demo Hardening

Primary outcome: a rehearsed, recoverable demo.

Tasks:
- `DEMO-001`: create demo script and operator checklist.
- `DEMO-002`: create fallback paths for MagicBlock, AI, and settlement failure.
- `POLISH-001`: improve visible boss adaptation and UI clarity.

Avoid broad refactors on Day 7 unless they unblock the demo.

## Required Versus Optional

Required before submission:
- `MB-001` through `MB-004`
- `APP-001`
- `GAME-001` through `GAME-005`
- `NET-001`
- `NET-003`
- `AI-001` through `AI-003`
- `SOL-001` through `SOL-003`
- `WEB-001` through `WEB-003`
- `QA-001` through `QA-003`
- `DEMO-001`

Optional after required demo works:
- `NET-002`
- `DEMO-002`
- `POLISH-001`
- `OPT-001`

## Escalation Rules

Escalate to the user when:
- Official MagicBlock documentation conflicts with this architecture.
- A required package cannot be installed or verified.
- Solana settlement cannot be demonstrated on the intended network.
- A task would require adding out-of-scope features.
- A task would require replacing working code instead of extending it.
