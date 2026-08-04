# Decisions

This file records planning decisions for the Adaptive AI Raid Boss MVP. Update it whenever architecture, scope, or critical implementation strategy changes.

## D-001: MagicBlock Is Authoritative For Real-Time Raid State

Status: accepted and docs-verified.

Decision: combat state should execute through MagicBlock Ephemeral Rollups. Clients may render and predict, but they do not own boss HP, player HP, raid status, cooldowns, or contribution scoring.

Rationale: this is the core hackathon story and avoids sending one Solana transaction per rendered frame.

Implementation choice: target MagicBlock public devnet for the demo and use the Asia ER validator `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`.

Verification note: see `docs/MAGICBLOCK_VERIFICATION.md`.

## D-002: Solana Stores Final Settlement, Not Every Tick

Status: accepted.

Decision: the Solana program stores the final raid result and contribution scores. It does not persist every combat tick in the MVP.

Rationale: final settlement is demoable, verifiable, and realistic within one week.

## D-003: The LLM Can Only Select An Approved Strategy Enum

Status: accepted.

Decision: the LLM output is limited to an approved `BossStrategy` enum and a short explanation. Zod validates the response. Invalid responses use deterministic fallback logic.

Rationale: the AI should be a high-level strategist, not an arbitrary state mutator.

## D-004: Next.js App Router Hosts The Web App And AI API

Status: accepted pending scaffold.

Decision: use Next.js App Router for the frontend shell and API routes unless MagicBlock verification requires a separate service.

Rationale: one deployable Vercel app is simpler for a hackathon.

## D-005: Phaser Owns Rendering, Not Authority

Status: accepted.

Decision: Phaser renders the arena at 60 FPS. Authoritative updates may run at a lower tick rate and should be interpolated visually.

Rationale: this keeps the game responsive while preserving a clean state boundary.

## D-006: Primary Demo Targets 2-4 Players

Status: accepted.

Decision: the primary demo supports 2-4 players. The design should not prevent 8 players, but 5-8 player polish is optional.

Rationale: a reliable live demo is more valuable than a fragile max-capacity claim.

## D-007: Room Codes Are The Join Primitive

Status: accepted.

Decision: players join raids using short room codes.

Rationale: this minimizes onboarding friction during judging.

## D-008: Deterministic Fallbacks Are Required For AI And Network Failures

Status: accepted.

Decision: if the LLM API, MagicBlock connection, or settlement flow fails, the app must expose a clear fallback state and continue as far as possible.

Rationale: live demos fail in boring ways. Recovery paths should be planned before polish.

## D-009: Anchor Accounts Stay Small

Status: accepted.

Decision: settlement accounts store bounded final result data only. Use checked arithmetic and bounded player contribution arrays.

Rationale: smaller account structures reduce implementation risk and test burden.

## D-010: Do Not Invent MagicBlock APIs

Status: accepted.

Decision: no code should call MagicBlock methods or endpoints unless they are verified from installed packages or official documentation.

Rationale: fabricated SDK usage is the fastest way to lose the demo.

## D-013: Use Magic Router As Primary Frontend RPC Path

Status: accepted and docs-verified.

Decision: use Magic Router as the primary application connection for the MVP. Keep explicit base-layer and ER validator connections available only for tests, diagnostics, or docs-required operations.

Rationale: Magic Router should reduce client complexity by routing transactions to the appropriate layer.

Selected endpoint: `https://devnet-router.magicblock.app`.

Verification note: Magic Router answered the documented `/getDelegationStatus` route from this machine.

## D-014: Use Web3.js-Compatible MagicBlock SDK Path

Status: accepted and package-verified.

Decision: use `@solana/web3.js` with `@magicblock-labs/ephemeral-rollups-sdk@0.16.2` for the MVP, unless installed package smoke tests require a change.

Rationale: this should fit Anchor and Solana wallet integration with the least moving parts.

## D-015: Delegate One Compact RaidState PDA

Status: accepted.

Decision: use one bounded `RaidState` PDA for the MVP containing boss, players, timer, current strategy, raid status, and contribution counters.

Rationale: one account keeps the demo easier to reason about and reduces cross-account synchronization risk.

## D-016: Commit And Undelegate RaidState At Raid End

Status: accepted and docs-verified.

Decision: end the raid by committing and undelegating the compact `RaidState` PDA before showing final settlement success. Use `MagicIntentBundleBuilder.commit_and_undelegate(...)`. Avoid Magic Actions unless a later requirement needs automatic post-commit base-layer instructions.

Rationale: the simplest settlement path is easier to test and explain.

## D-017: Use Session Keys For Gameplay Transactions

Status: accepted and docs-verified.

Decision: use Session Keys for frequent player movement and attack transactions after basic ER delegation is working.

Rationale: repeated wallet popups during real-time combat would harm the demo.

Verified packages: Rust crate `session-keys@3.1.1` with `no-entrypoint`; frontend package `@magicblock-labs/gum-react-sdk@3.0.10`.

## D-018: Server/Demo Authority Submits AI Strategy Updates

Status: accepted.

Decision: a server or demo authority wallet submits AI-selected strategy updates. The authoritative rules still validate strategy enum, cooldown, phase, and adaptation count.

Rationale: this avoids letting arbitrary clients spoof AI decisions while preserving deterministic validation.

## D-019: Low-Rate Movement Intents With Phaser Interpolation

Status: accepted.

Decision: send movement intents at a low fixed rate, initially targeting 5-10 Hz, while Phaser renders and interpolates at 60 FPS.

Rationale: this is more realistic than transaction-per-frame movement and preserves a smooth browser feel.

## D-020: Solana Devnet Is Acceptable For Demo Settlement

Status: accepted.

Decision: use Solana devnet for final hackathon settlement unless hackathon rules explicitly require another network.

Rationale: devnet reduces operational risk during a one-week build.

## D-021: Pin SBF-Compatible Anchor Dependency Graph

Status: accepted and verified in `SOL-001`.

Decision: commit `Cargo.lock` and preserve narrow compatibility pins for the Anchor settlement scaffold while the local Solana CLI is `2.1.21` and `cargo build-sbf` uses Rust/Cargo `1.79`. The direct pins are `blake3 = "=1.5.5"`, `proc-macro-crate = "=3.3.0"`, `indexmap = "=2.11.4"`, `unicode-segmentation = "=1.12.0"`, and `zeroize = "=1.8.2"`.

Rationale: fresh dependency resolution pulled transitive crates requiring Rust 1.85 or edition 2024, which blocked `anchor test` under the Solana SBF toolchain. The pinned graph lets `anchor test` and `cargo test` pass without adding a direct `solana-program` dependency that Anchor warns against.

Verification note: run Rust and Anchor checks from the repository root with `CARGO_HOME="$PWD/.cargo-home"`.

## D-022: Vendor SBF-Compatible MagicBlock Rust SDK Patch

Status: accepted and verified in `MB-002`.

Decision: use `ephemeral-rollups-sdk@0.16.2` APIs through local `[patch.crates-io]` vendored crates while this workspace targets Anchor `0.31.1`, Solana CLI `2.1.21`, and the bundled SBF Cargo/Rust `1.79` toolchain. The local patch preserves the delegate and commit APIs required for `MB-002` and trims unused VRF/action-delegation/newer-Solana dependency surfaces that are outside the current spike.

Rationale: the official crate graph pulled transitive crates such as `wincode` and `wincode-derive` that require edition 2024 or a newer compiler than `cargo-build-sbf` provides locally. The vendored compatibility path keeps the MagicBlock authoritative state spike buildable without changing the accepted Anchor/Solana toolchain.

Verification note: `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'`, `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" cargo test'`, and frontend MagicBlock smoke all pass after the patch.

Escalate before using MagicBlock VRF, action-delegation, session-key program integration, or other crate surfaces not exercised by `MB-002`.

## D-011: Initial Repository Structure

Status: accepted.

Decision: keep top-level directories:
- `frontend/` for Next.js, Phaser, React, and API routes.
- `programs/` for Anchor/Rust settlement program.
- `backend/` only if verified MagicBlock or AI needs a separate service.
- `docs/` for planning.
- `prompts/` for specialist agent instructions.

Rationale: this fits the existing repository skeleton and keeps ownership obvious.

## D-012: Test Coverage Follows Demo Risk

Status: accepted.

Decision: prioritize tests for deterministic game rules, AI validation/fallback, and settlement constraints. UI tests should cover the demo path rather than every visual detail.

Rationale: the MVP needs confidence in critical behaviour, not exhaustive coverage.
