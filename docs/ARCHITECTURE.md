# Architecture

Adaptive AI Raid Boss uses a deliberately small architecture: browser rendering, authoritative real-time game execution through MagicBlock, constrained AI strategy selection, and final Solana settlement.

## Architecture Goals

- Make MagicBlock visibly central to the real-time raid.
- Keep deterministic combat rules outside the LLM.
- Let Phaser render smoothly without becoming authoritative.
- Commit only final raid results to Solana.
- Keep the system demoable by one developer in seven days.
- Make failures recoverable with local deterministic fallbacks.

## Current Repository State

As of 2026-08-03:
- `frontend/`, `backend/`, and `programs/` are empty placeholders.
- There is no initialized Next.js app.
- There is no Anchor workspace.
- There are no package manifests or test scripts yet.

This document describes the target MVP architecture. `MB-001` must verify MagicBlock and Magic Router APIs before coding against them.

## System Components

| Component | Planned location | Responsibility | Authoritative? |
| --- | --- | --- | --- |
| Next.js app | `frontend/` | App shell, routing, wallet connection, room UI, analytics panel | No |
| Phaser client | `frontend/` | 60 FPS rendering, input capture, interpolation, effects | No |
| Shared game domain | `frontend/src/game` or shared package after scaffold | Types, deterministic rules, Zod schemas, simulation helpers | Partially, when reused by authoritative layer |
| MagicBlock execution layer | To verify in `MB-001` | Low-latency authoritative raid state and combat transitions | Yes |
| AI strategy API | `frontend/app/api` or `backend/` after scaffold | Build analytics summary, call LLM, validate structured output | No direct state authority |
| Solana program | `programs/raid_settlement` | Store final raid result and contribution scores | Yes for settlement record |
| Demo tooling | `docs/`, `prompts/`, test scripts | Repeatable demo flow and fallback plan | No |

## Selected MagicBlock Integration

The MVP should target MagicBlock public devnet for the live demo and local ER development only for testing.

Selected choices:
- Network: MagicBlock public devnet.
- ER validator region: Asia.
- App routing: Magic Router is the primary frontend RPC path.
- SDK path: `@solana/web3.js` plus `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`.
- Delegated account model: one bounded `RaidState` PDA for MVP.
- Settlement flow: commit and undelegate the same compact `RaidState` PDA at raid end before final settlement display.
- Session authorization: use Session Keys for frequent gameplay transactions after basic ER delegation works.
- AI strategy authority: a server or demo authority wallet submits constrained strategy updates.
- Gameplay cadence: player movement intents at a low fixed rate, with Phaser interpolation at 60 FPS.
- Final settlement network: Solana devnet.

Verified docs-backed values:
- Magic Router devnet RPC endpoint: `https://devnet-router.magicblock.app`.
- Magic Router devnet WebSocket endpoint: `wss://devnet-router.magicblock.app/`.
- ER devnet Asia RPC endpoint: `https://devnet-as.magicblock.app`.
- ER devnet Asia WebSocket endpoint: `wss://devnet-as.magicblock.app/`.
- Asia ER validator public key: `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.
- Delegation program: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`.
- See `docs/MAGICBLOCK_VERIFICATION.md` for the full `MB-001` record.

## Authority Boundaries

Authoritative state:
- Raid status: lobby, active, victory, defeat, timeout, settled.
- Boss HP, phase, current strategy, attack cooldowns.
- Player HP, class, position snapshot, cooldowns, alive status.
- Contribution counters.
- Raid timer and terminal result.

Visual-only state:
- Camera movement.
- Attack animations.
- Hit flashes.
- Damage number particles.
- Local interpolation and prediction.
- UI transitions.

LLM-controlled state:
- Only one value: `strategy`, selected from the approved enum.
- The selected strategy is advisory until accepted by deterministic game rules.

The LLM must not control:
- Damage values.
- Player or boss HP.
- Cooldowns.
- Token transfers.
- Wallet balances.
- Arbitrary account fields.
- Settlement outcomes.

## Raid Lifecycle

1. Create raid room.
2. Players join with room code.
3. Players choose class and connect wallet.
4. Raid starts when the host begins or minimum player count is met.
5. Clients send player inputs.
6. MagicBlock-authoritative state advances on fixed authoritative ticks.
7. Phaser clients render snapshots and interpolate locally.
8. Analytics summarizes recent team behaviour.
9. AI strategy API returns a validated strategy enum.
10. Authoritative rules accept or ignore the strategy based on cooldowns and phase.
11. Raid ends in victory, defeat, or timeout.
12. Final result and contribution scores are submitted to Solana.
13. UI displays settlement status and result.

## Boss Strategy Enum

Initial approved strategies:

```ts
type BossStrategy =
  | "area_denial"
  | "leap_to_ranged"
  | "magic_resistance"
  | "focus_healer"
  | "melee_retaliation";
```

Deterministic fallback order:
1. `area_denial` if players are clustered.
2. `leap_to_ranged` if ranged damage dominates.
3. `magic_resistance` if magic damage dominates.
4. `focus_healer` if healing is frequent.
5. `melee_retaliation` if melee damage dominates.
6. Current strategy remains unchanged if no condition is strong enough.

## Boss Attacks

Required attack set:

| Attack | Purpose | Strategy or phase relationship |
| --- | --- | --- |
| Cleave | Baseline close-range threat | Always available |
| Ground Slam | Area damage around boss | Stronger with `area_denial` |
| Leap | Gap-close toward ranged players | Used by `leap_to_ranged` |
| Arcane Shield | Temporary magic resistance | Used by `magic_resistance` |
| Marked Strike | Focus one priority target | Used by `focus_healer` or phase 3 |

Damage, radius, cooldown, and duration must be constants in deterministic code, not LLM outputs.

## Boss Phases

| Phase | Trigger | Behaviour |
| --- | --- | --- |
| Phase 1 | Boss HP 100%-66% | Baseline attacks, slow adaptation cadence |
| Phase 2 | Boss HP 65%-33% | Faster cooldowns, one AI adaptation allowed |
| Phase 3 | Boss HP below 33% | Stronger attack cadence, final adaptation allowed |

Phase transitions are deterministic and based on boss HP thresholds.

## Analytics Model

The analytics panel and AI request should use the same validated summary:

- Player count.
- Average pairwise distance or cluster score.
- Damage by class and damage type.
- Healing events in the recent window.
- Downed players.
- Boss phase.
- Current boss strategy.
- Time remaining.

The summary is data for strategy selection, not authority over state.

## Solana Settlement Model

The Solana program should store the smallest useful final result:

- Raid identifier.
- Authority or creator.
- Result: victory, defeat, or timeout.
- Duration.
- Boss final HP.
- Player contribution scores.
- Settled timestamp or slot if available.

The Solana program does not need to replay every combat tick for the MVP. It records the final verifiable result produced by the authoritative raid flow.

## Remaining MagicBlock Checks

During scaffold and smoke tests, verify:
- Any API changes between the verified docs and installed packages during scaffold.
- Anchor feature selection for `ephemeral-rollups-sdk@0.16.2`.
- Next.js App Router compatibility for `@magicblock-labs/gum-react-sdk@3.0.10`.
- Smoke-test results for delegate, commit, undelegate, and Session Keys after the local toolchain is installed.

No code should call undocumented MagicBlock APIs.

## Runtime Validation

Use Zod for:
- Client input messages.
- Raid snapshots.
- Analytics summaries.
- AI structured JSON output.
- Settlement request payloads.

Invalid payloads must be rejected with visible logs and deterministic fallbacks.

## Deployment Shape

MVP deployment target:
- Frontend and AI API on Vercel.
- MagicBlock/Magic Router environment based on verified docs.
- Solana devnet for hackathon demo unless mainnet/testnet requirements say otherwise.

Local demo target:
- Browser clients on localhost.
- Local or devnet Solana depending on program stage.
- Mock AI fallback available if the LLM API is unavailable.

## Security And Safety

- Never trust client-reported damage or final scores without authoritative validation.
- Validate wallet signers for settlement.
- Use checked arithmetic in Rust.
- Bound vector lengths in accounts.
- Prevent duplicate settlement.
- Preserve deterministic fallback behaviour when AI, network, or settlement fails.
- Do not store secrets in the repository.
