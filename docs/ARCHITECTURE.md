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

As of 2026-08-05:
- `frontend/` contains the initialized Next.js app, Phaser room game, wallet UI, AI strategy panel, authority panel, settlement panel, and room API routes.
- `programs/raid_settlement/` contains the compact per-room MagicBlock `RaidState`, on-chain room roster instructions, finalization instruction, and bounded settlement record instruction.
- Root `Anchor.toml`, root `Cargo.toml`, and `Cargo.lock` exist.
- `backend/` is still an empty placeholder.
- Per-room MagicBlock PDAs and on-chain live room rosters are implemented on Solana devnet. Production hosted snapshot/session storage is not implemented yet.

This document describes the target MVP architecture. `MB-001` verified the initial MagicBlock and Magic Router path; later implementation must continue to verify installed package APIs before coding against them.

## System Components

| Component | Planned location | Responsibility | Authoritative? |
| --- | --- | --- | --- |
| Next.js app | `frontend/` | App shell, routing, wallet connection, room UI, analytics panel, transient room snapshot cache | No |
| Phaser client | `frontend/` | 60 FPS rendering, input capture, interpolation, effects | No |
| Shared game domain | `frontend/src/game` or shared package after scaffold | Types, deterministic rules, Zod schemas, simulation helpers | Partially, when reused by authoritative layer |
| MagicBlock execution layer | `programs/raid_settlement`, `frontend/src/lib/room-chain.ts`, `frontend/src/lib/magicblock-authority.ts` | Canonical live room roster and low-latency authoritative combat transitions when live authority is enabled | Yes |
| AI strategy API | `frontend/src/app/api` | Build analytics summary, call LLM, validate structured output | No direct state authority |
| Solana program | `programs/raid_settlement` | Store final raid result and contribution scores | Yes for settlement record |
| Demo tooling | `docs/`, `prompts/`, test scripts | Repeatable demo flow and fallback plan | No |

## Selected MagicBlock Integration

The MVP should target MagicBlock public devnet for the live demo and local ER development only for testing.

Selected choices:
- Network: MagicBlock public devnet.
- ER validator region: Asia.
- App routing: Magic Router is the primary frontend RPC path.
- SDK path: `@solana/web3.js` plus `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`.
- Delegated account model: one bounded per-room `RaidState` PDA derived from `[raid-state, raid_id]`.
- Room roster model: live room create/join write wallet/class slots into the on-chain `RaidState`; the Next store caches snapshots and can reconstruct a room from chain by room code.
- Settlement flow: commit and undelegate the room `RaidState` PDA at raid end before final Solana devnet settlement.
- Day 6 room split: roster/lifecycle/contribution-critical state is on-chain; room server keeps movement authoritative for low-latency visuals; combat-critical hits route through Magic Router when `MAGICRAID_MAGICBLOCK_AUTHORITY=live`; UI labels live versus fallback mode.
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

On-chain authoritative live state:
- Room roster wallets/classes.
- Raid lifecycle: active, victory, defeat, or timeout.
- Boss HP and max HP.
- Current boss strategy.
- Player count and contribution damage.
- Elapsed seconds used for MagicBlock/settlement validation.

Room-server authoritative cached state:
- High-frequency player positions and facing.
- Player HP, cooldowns, alive/downed status, boss attack cooldowns, and active attack effects.
- Display names, local session ids, analytics history, and UI convenience state.
- Reconstructed snapshots derived from the on-chain roster plus local movement/visual state.

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
2. In live/on-chain mode, initialize the per-room `RaidState` with the host wallet/class.
3. Players join with room code; live/on-chain joins call `join_raid` to append wallet/class slots before combat starts.
4. Players choose class and connect wallet.
5. Clients send player inputs.
6. The room server advances movement and visual snapshots; combat-critical hits delegate the per-room `RaidState` on demand and reconcile with MagicBlock readbacks when live authority is enabled.
7. Phaser clients render snapshots and interpolate locally.
8. Analytics summarizes recent team behaviour.
9. AI strategy API returns a validated strategy enum.
10. Authoritative rules accept or ignore the strategy based on cooldowns and phase.
11. Raid ends in victory, defeat, or timeout.
12. Final result and contribution scores are submitted to Solana through `settle_raid`; the program validates terminal status, roster wallets, and damage contributions against `RaidState`.
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

The Solana program should store the smallest useful live room and final result data:

- Raid identifier.
- Authority or creator.
- Room roster wallets/classes.
- Result: victory, defeat, or timeout.
- Duration.
- Boss final HP.
- Player contribution scores.
- Settled timestamp or slot if available.

The Solana program does not need to replay every combat tick for the MVP. It records the final verifiable result produced by the authoritative raid flow.

Day 6 implementation:
- `RaidState` stores compact MagicBlock-authoritative room roster wallets/classes, lifecycle, boss HP, elapsed seconds, strategy, player count, and contribution damage.
- `RaidState` PDA seeds are `[raid-state, raid_id]`; room gameplay derives `raid_id` from `magicraid:${ROOM_CODE}`.
- `initialize_raid` creates roster slot 0; `join_raid` appends player wallets/classes before combat starts.
- `SettlementRecord` PDA uses seed `settlement-record` plus the `RaidState` PDA.
- `settle_raid` rejects non-terminal raids, duplicate settlement, invalid signer, mismatched result/duration/boss HP, invalid player count, score-bound violations, default or mismatched player wallets, and contribution damage that does not match `RaidState`.

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
