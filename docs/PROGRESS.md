# Progress

This file tracks actual implementation progress and verification results. Keep it factual and update it after each meaningful task.

## Current Repository Snapshot

Date: 2026-08-04.

Repository contents:
- `docs/`: planning documents.
- `prompts/`: specialist agent prompts.
- `frontend/`: Next.js App Router scaffold with TypeScript, Tailwind CSS, Phaser 3 snapshot-driven raid arena, Day 4 room API routes, wallet UI, Zod schemas, Vitest, and ESLint.
- `Anchor.toml` and `Cargo.toml`: Anchor/Rust workspace scaffold.
- `programs/raid_settlement/`: Anchor settlement program skeleton.

Missing:
- No final raid-result settlement instruction beyond the `SOL-001` skeleton.
- No AI strategy submitter, analytics panel, or final settlement UI yet.
- No production room backend beyond the in-memory Next route authority used for the Day 4 demo.

Assessment: frontend and Anchor scaffolds exist. Baseline frontend, Solana scaffold, the `MB-002` MagicBlock-authoritative `RaidState` spike, the `MB-004` live devnet lifecycle smoke, `GAME-001` shared game contracts, `GAME-002` through `GAME-004` local gameplay, and Day 4 room sync/wallet UI pass. AI, final settlement, and production room hosting remain ahead.

## Task Status

| Task | Status | Notes |
| --- | --- | --- |
| `PLAN-001` | Complete | Planning docs drafted from `prompts/bootstrap.md`. |
| `PLAN-002` | Complete | Specialist prompt files drafted. |
| `MB-001` | Complete for planning | Official docs, endpoints, package names, package versions, and local toolchain availability recorded in `docs/MAGICBLOCK_VERIFICATION.md`. |
| `MB-002` | Complete | Compact `RaidState` PDA, deterministic hit transition, MagicBlock delegate/commit/commit-and-undelegate instruction surface, frontend PDA constants, and smoke test are implemented and verified. |
| `MB-003` | Complete | MagicBlock runbook, smoke command, environment values, SDK patch decision, and failure-mode fallbacks are documented. |
| `MB-004` | Complete | Program deployed to Solana devnet and live initialize/delegate/router-hit/commit-and-undelegate/readback smoke passed. |
| `APP-001` | Complete | Next.js frontend scaffold created under `frontend/`; typecheck, lint, test, and build pass. |
| `GAME-001` | Complete | Shared game bounds, cooldown constants, gameplay state schemas, network payload schemas, AI analytics/strategy schemas, and settlement summary schemas are implemented and verified. |
| `GAME-002` | Complete | Phaser renders a snapshot-driven local arena with player movement, boss/player sprites, HP bars, attack indicators, and React action controls. |
| `GAME-003` | Complete | Warrior, Ranger, and Mage normal/special attacks use deterministic damage, range, cooldown, damage type, and bounds. |
| `GAME-004` | Complete | Boss phases, Cleave, Ground Slam, Leap, Arcane Shield, Marked Strike, strategy-influenced attack preference, and cooldown rules are implemented and verified. |
| `NET-001` | Complete | Clients submit validated inputs to the Next room authority and poll shared authoritative snapshots rendered with Phaser interpolation. |
| `NET-002` | Complete | Saved room/player IDs recover latest snapshots on reload; invalid room codes and rejected inputs surface recoverable UI errors. |
| `WEB-001` | Complete | Users can create a room code and another client can join it through the room form. |
| `WEB-002` | Complete | Wallet UI supports injected Solana wallet connect when available, demo wallet fallback, address display, copy, explorer, and disconnect. |
| `QA-001` | Complete | Baseline frontend `npm run typecheck`, `npm run lint`, and `npm run test` pass. |
| `SOL-001` | Complete | Anchor settlement workspace scaffolded; `anchor test` and `cargo test` pass with the local Cargo cache convention. |
| `NET-003` | Not started | Explicit follow-up for routing gameplay-critical room authority through MagicBlock instead of only the in-memory Next room authority. |
| Remaining game, AI, settlement, QA, demo tasks | Not started | Await contribution scoring terminal polish, AI strategy, MagicBlock-routed room authority, final settlement flow, and demo hardening. |

## Repository Assessment Commands Run

Commands run during bootstrap:
- `rg --files`
- `find . -maxdepth 3 -type d`
- `find . -maxdepth 3 -name package.json -type f`
- `find . -maxdepth 3 -name Anchor.toml -type f`
- `find . -maxdepth 4 -name Cargo.toml -type f`
- `find . -maxdepth 3 -name tsconfig.json -type f`
- `find . -maxdepth 3 -name next.config.js -type f`
- `find . -maxdepth 3 -name next.config.mjs -type f`

Result: no app or program manifests were found.

## Verification Log

Baseline frontend verification commands now exist under `frontend/`.

Bootstrap consistency review:
- Roadmap milestones have task IDs.
- Sprint tasks exist in `docs/TASKS.md`.
- Architecture decisions are recorded in `docs/DECISIONS.md`.
- Current empty repository state is reflected in this file.
- Open risks are listed in `docs/KNOWN_ISSUES.md`.
- Specialist prompts reference the shared docs and stopping rules.

`MB-001` verification:
- Read official MagicBlock ER Quickstart, Local Development, Magic Router, Router API, and Session Keys docs.
- Checked NPM metadata for `@magicblock-labs/ephemeral-rollups-sdk`, `@magicblock-labs/ephemeral-validator`, and `@magicblock-labs/gum-react-sdk`.
- Checked crates index metadata for `ephemeral-rollups-sdk` and `session-keys`.
- Confirmed Magic Router `/getDelegationStatus` responds from this machine.
- Confirmed Solana devnet and ER devnet Asia `getHealth` respond from this machine.
- Confirmed ER devnet Asia `getVersion` reports MagicBlock core `0.13.19`.
- Corrected Asia validator key to `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.

`APP-001` verification:
- Created Next.js App Router scaffold in `frontend/`.
- Configured TypeScript strict mode, Tailwind CSS, Phaser 3, Zod, Vitest, ESLint, and MagicBlock ER SDK.
- Added a client-side Phaser 3 runtime probe.
- Added Zod schemas for the first raid summary contract.
- Added Vitest smoke tests for schemas and MagicBlock constants.
- Production build required escalation because Turbopack tried to bind a local port inside the sandbox; the escalated build passed.

`QA-001` verification, run on 2026-08-04 from `frontend/`:
- `zsh -lic 'npm run typecheck'`: passed.
- `zsh -lic 'npm run lint'`: passed.
- `zsh -lic 'npm run test'`: passed; 1 test file and 3 tests passed.
- The `zsh -lic` shell startup emitted non-blocking local shell initialization warnings (`compinit` and Bun completion), but all commands exited 0.
- No failing baseline commands were recorded in `docs/KNOWN_ISSUES.md`.

`SOL-001` verification, run on 2026-08-04 from the repository root:
- Created the Anchor workspace manifest, Rust workspace manifest, and `programs/raid_settlement` crate.
- Added a no-op `initialize` instruction, bounded settlement record types, contribution score bounds, and checked contribution score aggregation.
- Added Rust unit tests for checked score aggregation, overflow rejection, and score component bounds.
- Generated local program ID `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`.
- Pinned the Cargo lockfile and narrow direct compatibility dependencies so Solana SBF Cargo 1.79 can build the Anchor 0.31.1 scaffold.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'`: passed; SBF build completed and 4 Rust tests passed.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo test'`: passed; 4 Rust tests and 0 doctests passed.
- `zsh -lic 'cargo fmt --all --check'`: passed.
- Direct unprefixed `anchor test` failed in this local environment because the global Cargo registry cache contains root-owned entries; use the local `CARGO_HOME="$PWD/.cargo-home"` convention recorded in `docs/KNOWN_ISSUES.md`.
- Anchor/Rust macro expansion emits non-blocking `unexpected cfg` warnings under the host Rust toolchain; verification commands still exit 0.

`MB-002` verification, run on 2026-08-04:
- Implemented a compact authoritative `RaidState` PDA at seed `raid-state` for program `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`.
- `RaidState` stores raid id, authority, lifecycle, boss HP, timer, strategy enum, player count, and bounded per-player damage contributions.
- Added deterministic mutation through `apply_player_hit`: only the authority signer can mutate, player indexes are bounded, hit damage is capped at `250`, final hits clamp to remaining boss HP, contribution math is checked, and terminal raids reject further mutation.
- Added MagicBlock program integration with `#[ephemeral]`, `#[delegate]`, `delegate_raid`, `commit_raid`, and `commit_and_undelegate_raid`.
- Added frontend MagicBlock constants, deterministic `deriveRaidStatePda`, and `frontend/scripts/magicblock-smoke.mjs`.
- Added local SBF-compatible vendor patches for the MagicBlock Rust crates under `vendor/`; see `D-022` in `docs/DECISIONS.md`.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo fmt --all --check'`: passed.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo test'`: passed; 9 Rust tests passed.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'`: passed; SBF build completed and 9 Rust tests passed.
- `zsh -lic 'npm run typecheck'` from `frontend/`: passed.
- `zsh -lic 'npm run lint'` from `frontend/`: passed.
- `zsh -lic 'npm run test'` from `frontend/`: passed; 1 test file and 4 tests passed.
- `zsh -lic 'npm run magicblock:smoke'` from `frontend/`: passed.
- MagicBlock smoke derived `RaidState` PDA `9RBTUMV256FVkNnEBZWrgWYK63YjYbUzWAYvWnjQzeny` with bump `254`, reached Magic Router, resolved closest validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` at `https://devnet-as.magicblock.app/`, confirmed the fresh PDA is not delegated yet, confirmed Solana devnet core `4.1.2`, and confirmed ER Asia reports MagicBlock core `0.13.19` with Solana core `4.0.0`.
- This smoke confirms endpoint reachability, PDA derivation, router API shape, and undelegated-state readiness. The full live transaction lifecycle is covered by `MB-004`.

`MB-003` verification:
- This file now records the MagicBlock runbook, setup values, run commands, and smoke-test interpretation.
- `docs/KNOWN_ISSUES.md` records MagicBlock smoke failures, delegation-state failures, SDK/SBF compatibility risks, and fallback steps.
- Fresh-agent verification command: `rg "MagicBlock runbook|MagicBlock smoke" docs/PROGRESS.md docs/KNOWN_ISSUES.md`.

`MB-004` live devnet lifecycle verification, run on 2026-08-04:
- Confirmed local devnet authority `HiT7oAoWmxebzpuUoY9HrYZeSR4ScEP7vARVs3vVQb5J` had sufficient devnet SOL.
- Confirmed `target/deploy/raid_settlement-keypair.json` matches program id `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`.
- Confirmed the program was absent from Solana devnet before deployment.
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor deploy --provider.cluster devnet'`: passed; deploy signature `4Ukc8uhs2j5GLwDB9DiDuGDPBUvC9VFLPSNVjpiMUPKL8DMaoCBUKtWhoDhHGkHWWTgNFtHZ86tYpuzz4YXtDsDy`.
- Added repeatable live lifecycle script `frontend/scripts/magicblock-live-smoke.mjs` and package script `npm run magicblock:live-smoke`.
- `zsh -lic 'npm run magicblock:live-smoke'` from `frontend/`: passed.
- Live smoke initialized `RaidState` with signature `3c9geeGHfE4y94Zw6tabnK2umZR9JjZPTDVkPPr3PRuUxPUCd7RCwjTx6xXfKn3tgkiwBMSWWAx95XmVZzSJoUYH`.
- Live smoke delegated `RaidState` with signature `5w9EEq8q7x1rTL3jp6CYpsEeRC7Zun1V6dvQjG68UkTogMiqkNb1PH3DaDix9k51a4d7wZbVDwhymY5o2YYpnR1D`.
- Magic Router reported `isDelegated: true`, `fqdn: https://devnet-as.magicblock.app/`, delegation authority `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`, delegation owner `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`, and delegation slot `481203017`.
- Live smoke applied one router-routed hit with signature `JSpmvJEHJBvzEjb8ger8NLy2L6Ji6AqL81vqCdi3qpZsurtABaYyF3fqUxjx5ehjR1BSK9Syp1Vn9ZPJJfmAVZt`; router state changed from boss HP `1200` and contribution `[0, ...]` to boss HP `1199` and contribution `[1, 0, 0, 0, 0, 0, 0, 0]`.
- Live smoke committed and undelegated with signature `5XetsHAcFfuHLVTFwQZBSvWRuwcc8YYW48JDU8a82ESh12iAD8yVzECvxfHGv2vyMSgvtVyXxCTKGmnYKc7A8f3M`.
- Magic Router reported `isDelegated: false` after commit/undelegate.
- Final Solana devnet readback returned owner `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`, lifecycle `active`, boss HP `1199`, player count `4`, strategy `area_denial`, and contribution damage `[1, 0, 0, 0, 0, 0, 0, 0]`.

`GAME-001` verification, run on 2026-08-04 from `frontend/`:
- Expanded `frontend/src/game/schemas.ts` into the shared gameplay contract for raid status, raid result, player class, boss strategy, boss phase, player state, boss state, attacks, client input messages, server snapshot messages, analytics summaries, AI strategy decisions, and settlement summaries.
- Added constants for player bounds, arena size, raid duration, boss HP, attack caps, cooldowns, network tick/input limits, and contribution score bounds.
- `frontend/src/lib/magicblock.ts` now reuses the shared game bounds for `RAID_STATE_RULES` and re-exports the approved boss strategy schema without changing existing imports.
- Added Vitest coverage for raid snapshots, invalid movement and arena payloads, AI analytics and strategy decisions, settlement summary score bounds, MagicBlock constants, and cooldown bounds.
- `zsh -lic 'npm run typecheck'`: passed.
- `zsh -lic 'npm run test -- game'`: passed; 1 test file and 8 tests passed.
- `zsh -lic 'npm run test'`: passed; 1 test file and 8 tests passed.
- `zsh -lic 'npm run lint'`: passed.
- The `zsh -lic` shell startup emitted the known non-blocking local shell initialization warnings (`compinit` and Bun completion), but all commands exited 0.

`GAME-002`, `GAME-003`, and `GAME-004` verification, run on 2026-08-04 from `frontend/`:
- Added deterministic gameplay rules in `frontend/src/game/rules.ts` for snapshot creation, arena-bounded movement, class attacks, cooldown enforcement, damage bounds, contribution damage, boss phases, boss attacks, strategy-influenced boss attack priority, Magic Shield resistance, defeat, victory, and timeout transitions.
- Added `frontend/src/components/phaser-arena.tsx`, replacing the old runtime probe on the home page with a playable local Phaser arena that renders procedural top-down player and boss sprites, arena bounds, HP bars, attack indicators, class controls, action buttons, status, phase, damage, and strategy selection from authoritative snapshots.
- Updated `frontend/src/game/schemas.ts` so boss snapshots include per-attack ready times for deterministic boss cooldowns.
- Added Vitest coverage in `frontend/src/game/__tests__/rules.test.ts` and `frontend/src/game/__tests__/boss.test.ts`.
- `zsh -lic 'npm run typecheck'`: passed.
- `zsh -lic 'npm run lint'`: passed.
- `zsh -lic 'npm run test -- game'`: passed; 3 test files and 23 tests passed.
- `zsh -lic 'npm run test -- boss'`: passed; 1 test file and 6 tests passed.
- `zsh -lic 'npm run test'`: passed; 3 test files and 23 tests passed.
- Local app manual check: `zsh -lic 'npm run dev -- --port 3000'` served `http://localhost:3000`.
- Browser check used transient `playwright@1.56.1` outside the repo to capture `/tmp/magicraid-arena-desktop.png` at `1280x900` and `/tmp/magicraid-arena-mobile.png` at `375x900`; both screenshots showed a nonblank Phaser canvas with player, boss, HP bars, controls, and no incoherent overlap after the sizing fix.
- The in-app Browser control tool was not exposed by tool discovery in this session, so the manual check used the transient Playwright CLI instead.
- The `zsh -lic` shell startup emitted the known non-blocking local shell initialization warnings (`compinit` and Bun completion), but all verification commands exited 0.

`DAY-04` multiplayer room verification, run on 2026-08-05 from `frontend/`:
- Added room/network schemas for room profiles, create/join requests, profile updates, and room sessions.
- Added `frontend/src/game/room-authority.ts` as a deterministic in-memory room authority: it creates room codes, enforces the 4-player demo cap, validates all client inputs with Zod, rejects stale input sequences, advances boss snapshots server-side, and recovers the latest snapshot by room code plus player id.
- Added Next route handlers under `frontend/src/app/api/rooms/` for create, join, snapshot recovery, input submission, and profile/wallet update.
- Refactored `frontend/src/components/phaser-arena.tsx` so Phaser renders authoritative snapshots from React, interpolates entity positions toward new snapshots, and emits movement/attack intents instead of owning private game state.
- Added `frontend/src/components/raid-room.tsx` with create/join room flow, invalid-code errors, saved-session recovery, roster, sync status, action controls, injected-wallet connect, demo wallet fallback, address copy, devnet explorer link, and disconnect.
- Updated `frontend/src/app/page.tsx` into the Day 4 multiplayer room surface while keeping verified MagicBlock devnet details visible.
- Added `frontend/src/game/__tests__/network.test.ts`.
- `zsh -lic 'npm run typecheck'`: passed.
- `zsh -lic 'npm run lint'`: passed.
- `zsh -lic 'npm run test -- network'`: passed; 1 test file and 5 tests passed.
- `zsh -lic 'npm run test'`: passed; 4 test files and 28 tests passed.
- `zsh -lic 'npm run build'`: passed; production build included `/api/rooms`, `/api/rooms/[roomCode]`, `/api/rooms/[roomCode]/input`, `/api/rooms/[roomCode]/join`, and `/api/rooms/[roomCode]/profile`.
- API smoke against `http://localhost:3000`: create room returned `200`, join returned `200` with 2 players, invalid join returned `404 room_not_found`, and recovery returned the latest snapshot.
- Browser control plugin was not exposed by tool discovery in this session, so visual verification used bundled Playwright after installing its Chromium cache outside the repo.
- Desktop browser smoke: host created room `GJ7SD8`, guest joined by code, host movement plus Strike dropped boss HP to `1176`, and guest observed the same HP/roster. Screenshots: `/tmp/magicraid-day04-host.png` and `/tmp/magicraid-day04-guest.png`.
- After input submission serialization, repeated the two-page smoke with room `SSSYU9`; no stale-input error was visible while the guest observed the shared HP drop.
- Mobile browser smoke at `375x900`: create room plus canvas render passed with no horizontal overflow. Screenshot: `/tmp/magicraid-day04-mobile.png`.
- Current limitation: Day 4 room sync uses an in-memory Next route authority for local demo clients. The MagicBlock `RaidState` lifecycle remains verified by `MB-004`, but routing every gameplay input through MagicBlock is not yet implemented in the room UI.

## MagicBlock runbook

Current public devnet configuration:
- Magic Router RPC: `https://devnet-router.magicblock.app`.
- Magic Router WebSocket: `wss://devnet-router.magicblock.app/`.
- Solana devnet RPC: `https://api.devnet.solana.com`.
- ER Asia RPC: `https://devnet-as.magicblock.app`.
- ER Asia WebSocket: `wss://devnet-as.magicblock.app/`.
- Asia ER validator: `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.
- Delegation program: `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh`.
- Raid settlement program: `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`.
- Raid state PDA seed: `raid-state`.
- Derived `RaidState` PDA for the current program id: `9RBTUMV256FVkNnEBZWrgWYK63YjYbUzWAYvWnjQzeny`, bump `254`.

Suggested environment variable names if the public constants move out of source later:
- `NEXT_PUBLIC_MAGICBLOCK_ROUTER_RPC=https://devnet-router.magicblock.app`.
- `NEXT_PUBLIC_MAGICBLOCK_ROUTER_WS=wss://devnet-router.magicblock.app/`.
- `NEXT_PUBLIC_SOLANA_DEVNET_RPC=https://api.devnet.solana.com`.
- `NEXT_PUBLIC_MAGICBLOCK_ER_ASIA_RPC=https://devnet-as.magicblock.app`.
- `NEXT_PUBLIC_MAGICBLOCK_ER_ASIA_WS=wss://devnet-as.magicblock.app/`.
- `NEXT_PUBLIC_MAGICBLOCK_ASIA_VALIDATOR=MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.
- `NEXT_PUBLIC_RAID_SETTLEMENT_PROGRAM_ID=2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72`.

Setup and verification commands:
- From the repository root, run toolchain commands through `zsh -lic`.
- Rust and Anchor commands must use `CARGO_HOME="$PWD/.cargo-home"` from the repository root.
- If frontend dependencies are missing, run `zsh -lic 'pnpm install --store-dir .pnpm-store'` from `frontend/`.
- Run `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo fmt --all --check'` from the repository root.
- Run `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo test'` from the repository root.
- Run `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'` from the repository root.
- Deploy or upgrade the devnet program with `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor deploy --provider.cluster devnet'` from the repository root.
- Run `zsh -lic 'npm run typecheck'` from `frontend/`.
- Run `zsh -lic 'npm run lint'` from `frontend/`.
- Run `zsh -lic 'npm run test'` from `frontend/`.
- MagicBlock smoke: run `zsh -lic 'npm run magicblock:smoke'` from `frontend/`.
- Live MagicBlock lifecycle smoke: run `zsh -lic 'npm run magicblock:live-smoke'` from `frontend/`; set `SOLANA_KEYPAIR=/path/to/funded-devnet-keypair.json` to override the default `~/.config/solana/id.json`.

Expected MagicBlock smoke interpretation:
- `closestValidator.ok` should be `true` and should resolve to the Asia validator for this project.
- `raidStateDelegationStatus.ok` should be `true`.
- `raidStateDelegationStatus.value.isDelegated` is expected to be `false` before a real initialize/delegate transaction runs.
- `solanaDevnetVersion.ok` and `erAsiaVersion.ok` should both be `true`.

Program lifecycle for the live devnet path:
1. Build and deploy the Anchor program to Solana devnet with the generated program id.
2. Fund the authority wallet.
3. Initialize the `RaidState` PDA with seed `raid-state`.
4. Delegate the `RaidState` PDA with `delegate_raid`, passing the Asia validator as the first remaining account.
5. Send deterministic gameplay mutations, starting with `apply_player_hit`, through Magic Router after delegation.
6. Use `commit_raid` for mid-raid state sync if the UI or debug panel needs base-layer visibility.
7. Use `commit_and_undelegate_raid` when the raid reaches victory or timeout.
8. Read the final account from Solana devnet before final settlement display.

Latest live lifecycle result:
- Program deploy succeeded on Solana devnet.
- `initialize_raid`, `delegate_raid`, router-routed `apply_player_hit`, `commit_and_undelegate_raid`, router undelegation check, and final devnet account readback all passed.
- Because `RaidState` currently uses a single fixed seed, rerunning the live smoke reuses the existing PDA instead of creating a fresh raid account.

## Immediate Next Step

Continue with `GAME-005` contribution scoring and terminal-state polish, then start Day 5 `AI-001` through `AI-003` so the room can show analytics-driven strategy changes. Keep `NET-003`, `SOL-002`, and `SOL-003` queued after the terminal raid summary is stable. In this Codex environment, run toolchain commands through `zsh -lic`; run Rust/Anchor commands with `CARGO_HOME="$PWD/.cargo-home"` from the repository root.

User-selected MagicBlock choices:
- Demo target: MagicBlock public devnet.
- ER validator region: Asia.
- RPC routing: Magic Router as primary app connection.
- SDK path: `@solana/web3.js` plus `@magicblock-labs/ephemeral-rollups-sdk` unless package verification changes this.
- Delegation model: one compact `RaidState` PDA.
- Raid-end flow: commit and undelegate the same `RaidState` PDA.
- Session Keys: include for frequent gameplay transactions if the verified path supports them.
- AI strategy submitter: server or demo authority wallet.
- Movement cadence: low-rate movement intents, Phaser interpolation at 60 FPS.
- Final settlement network: Solana devnet.

Verified package choices:
- `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`
- `ephemeral-rollups-sdk@0.16.2`
- `@magicblock-labs/ephemeral-validator@0.13.19`
- `session-keys@3.1.1`
- `@magicblock-labs/gum-react-sdk@3.0.10`

Installed frontend package versions:
- `next@16.2.12`
- `react@18.2.0`
- `react-dom@18.2.0`
- `typescript@5.9.3`
- `tailwindcss@4.3.3`
- `@tailwindcss/postcss@4.3.3`
- `phaser@3.90.0`
- `zod@4.4.3`
- `vitest@4.1.10`
- `vite@8.2.0`
- `eslint@9.39.5`
- `eslint-config-next@16.2.12`
- `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`
- `@solana/web3.js@1.98.4`

Dependency notes:
- Phaser is pinned to `3.90.0` because the project explicitly requires Phaser 3, while the current `phaser` latest tag is 4.x.
- React is pinned to `18.2.0` to preserve compatibility with the verified future Session Keys frontend package `@magicblock-labs/gum-react-sdk@3.0.10`.
- `@magicblock-labs/gum-react-sdk@3.0.10` is verified but deferred until Session Keys work begins.
- ESLint is pinned to `9.39.5` because Next's lint config plugins do not yet accept ESLint 10.

Frontend verification commands:
- `zsh -lic 'pnpm install --store-dir .pnpm-store'`
- `zsh -lic 'pnpm run typecheck'`
- `zsh -lic 'pnpm run lint'`
- `zsh -lic 'pnpm run test'`
- `zsh -lic 'pnpm run build'`
- `zsh -lic 'pnpm exec next dev --port 3000'`
- `curl -L http://localhost:3000`

Frontend smoke result:
- Dev server started at `http://localhost:3000`.
- `curl -L http://localhost:3000` returned the scaffold page.

Local toolchain:
- Plain non-interactive Codex PATH only exposes Codex's bundled `node`.
- The project folder's interactive login shell exposes the installed toolchain through `zsh -lic`.
- Rust and Anchor verification should use project-local Cargo cache prefix `CARGO_HOME="$PWD/.cargo-home"` because the global Cargo registry cache has root-owned entries.
- `node`: `v22.14.0`.
- `npm`: `10.9.2`.
- `npx`: `10.9.2`.
- `pnpm`: `10.33.0`.
- `yarn`: `1.22.22`.
- `rustc`: `rustc 1.94.0 (4a4ef493e 2026-03-02)`.
- `cargo`: `cargo 1.94.0 (85eff7c80 2026-01-15)`.
- `solana`: `solana-cli 2.1.21`.
- `anchor`: `anchor-cli 0.31.1`.
- `avm`: `avm 0.31.1`.
- `corepack`: `0.31.0`.

## Demo Script Placeholder

The final demo script will be created under `DEMO-001`. It should cover:
- Create raid.
- Join with room code.
- Connect wallets.
- Start fight.
- Show synchronized boss.
- Show analytics panel.
- Trigger AI or fallback adaptation.
- Finish raid.
- Submit settlement.
- Show final result.
