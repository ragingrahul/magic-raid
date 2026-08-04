# Known Issues

This file tracks unresolved risks, blockers, and assumptions. Do not hide uncertainty; turn it into an issue with a mitigation.

## KI-001: MagicBlock APIs Not Yet Verified

Severity: high.
Status: resolved for planning, keep watching during scaffold.

Issue: the repository has no MagicBlock code or package manifests yet. Product choices, docs-backed APIs, package names, and package versions are now recorded in `docs/MAGICBLOCK_VERIFICATION.md`.

Mitigation:
- Use the verified `MB-001` record before app scaffold decisions harden.
- Use only official documentation and installed package APIs.
- Update `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` if the verified path differs from the plan.
- Use public devnet, Asia validator, Magic Router, one compact `RaidState` PDA, Session Keys, and devnet settlement unless verification contradicts the choice.

Escalate if:
- Required MagicBlock functionality is unavailable for the hackathon environment.
- Installed package smoke tests contradict the verified docs.

## KI-002: No Application Scaffold Exists

Severity: high.
Status: resolved by `APP-001` and verified by `QA-001`.

Issue: `frontend/`, `backend/`, and `programs/` were empty. There were no build, typecheck, lint, or test commands.

Mitigation:
- `APP-001` created the frontend scaffold and package scripts.
- `QA-001` confirmed `npm run typecheck`, `npm run lint`, and `npm run test` pass from `frontend/`.
- Backend and Solana program scaffolds are tracked separately by `SOL-001` and later tasks.

Escalate if:
- Baseline frontend verification starts failing again.
- The scaffold requires moving away from the agreed stack.

## KI-003: No Anchor Workspace Exists

Severity: high.
Status: resolved by `SOL-001`.

Issue: there was no `Anchor.toml`, `Cargo.toml`, or settlement program.

Mitigation:
- `SOL-001` created `Anchor.toml`, root `Cargo.toml`, and `programs/raid_settlement`.
- The scaffold keeps settlement account structures small and bounded.
- `anchor test` and `cargo test` pass with the documented local Cargo cache convention.

Escalate if:
- Anchor stops compiling locally.
- Network requirements conflict with hackathon demo needs.

## KI-004: One-Week Solo Scope Is Tight

Severity: medium.
Status: open.

Issue: real-time multiplayer, MagicBlock, AI integration, Solana settlement, and demo polish are a lot for one developer in seven days.

Mitigation:
- Prioritize required tasks in `docs/ROADMAP.md`.
- Cut optional tasks first.
- Keep the primary demo at 2-4 players.

Escalate if:
- MagicBlock proof is not working by the end of Day 2.
- Multiplayer sync is not working by the end of Day 4.
- Settlement is not working by the end of Day 6.

## KI-005: AI API May Fail During Demo

Severity: medium.
Status: open.

Issue: LLM calls can time out, return invalid JSON, hit rate limits, or fail due to missing secrets.

Mitigation:
- Implement deterministic fallback in `AI-002`.
- Validate every response with Zod.
- Show fallback status honestly in the debug panel.

Escalate if:
- The LLM cannot be called from the intended deployment environment.

## KI-006: Real-Time Synchronization May Be Imperfect

Severity: medium.
Status: open.

Issue: perfect physics synchronization is out of scope, but poor synchronization could weaken the demo.

Mitigation:
- Use authoritative snapshots and client interpolation.
- Prefer clear authoritative correction over complex prediction.
- Document observed limits during `NET-001`.

Escalate if:
- 2-4 players cannot see consistent boss state.

## KI-007: Solana Settlement May Be Blocked By Network Or Wallet Issues

Severity: medium.
Status: open.

Issue: wallet setup, devnet congestion, RPC issues, or program deployment problems could block live settlement.

Mitigation:
- Build visible pending/success/failure states.
- Rehearse settlement before demo.
- Keep transaction data small.

Escalate if:
- A transaction cannot be built and signed by Day 6.

## KI-008: Secrets And Environment Configuration Are Undefined

Severity: medium.
Status: open.

Issue: LLM API keys, Solana RPC URLs, MagicBlock configuration, and Vercel environment variables are not defined.

Mitigation:
- Create documented `.env.example` during scaffold.
- Never commit secrets.
- Add deployment checklist under `DEMO-001`.

Escalate if:
- Required service credentials are unavailable.

## KI-009: Demo Proof Points Need To Be Obvious

Severity: medium.
Status: open.

Issue: judges may miss the distinction between local rendering, MagicBlock authority, AI strategy, and Solana settlement unless the UI makes them visible.

Mitigation:
- Build `WEB-003` analytics and strategy panel.
- Add settlement status UI.
- Use `DEMO-001` script to call out proof points.

Escalate if:
- UI changes hide or blur MagicBlock, AI, or Solana proof points.

## KI-010: Toolchain Requires Interactive Login Shell

Severity: low.
Status: resolved with command convention.

Issue: plain non-interactive Codex PATH only exposes Codex's bundled `node`, but the project folder's interactive login shell exposes the installed package manager and Solana/Rust/Anchor toolchain. `zsh -lic` may emit local shell initialization warnings before command output, but the QA-001 and SOL-001 commands exited 0.

Mitigation:
- Run toolchain commands with `zsh -lic '...'`.
- For Rust and Anchor commands, use `CARGO_HOME="$PWD/.cargo-home"` from the repository root.
- Use the versions recorded in `docs/MAGICBLOCK_VERIFICATION.md`.

Escalate if:
- A command fails even through `zsh -lic`.

## KI-011: Solana Web3 Optional Peer Warning

Severity: low.
Status: open.

Issue: `pnpm install` reports an optional transitive peer warning under `@solana/web3.js`: `ws@7.5.13` expects `utf-8-validate@^5.0.2`, while another installed version is `6.0.6`.

Mitigation:
- Do not add a workaround unless runtime WebSocket behaviour fails.
- Recheck during the first MagicBlock client smoke test in `MB-002`.

Escalate if:
- Magic Router or Solana websocket subscriptions fail in the browser or tests.

## KI-012: Global Cargo Registry Cache Has Root-Owned Entries

Severity: low.
Status: open local environment issue, mitigated.

Issue: unprefixed `anchor test` failed because `~/.cargo/registry/cache/index.crates.io-6f17d22bba15001f` is owned by `root`, causing permission errors while reading cached crates.

Mitigation:
- Use `CARGO_HOME="$PWD/.cargo-home"` for Rust and Anchor verification from the repository root.
- Keep `.cargo-home/` ignored.

Escalate if:
- Rust or Anchor verification fails even with the local Cargo cache prefix.

## KI-013: Solana SBF Cargo Cannot Build Latest Transitive Crates

Severity: medium.
Status: resolved with lockfile and compatibility pins.

Issue: `cargo build-sbf` uses the Solana 2.1.21 bundled Cargo/Rust 1.79 toolchain. Fresh dependency resolution pulled transitive crates that require Rust 1.85 or edition 2024, including `block-buffer`, `zeroize`, `toml_datetime`, and `indexmap`.

Mitigation:
- Commit `Cargo.lock`.
- Preserve the narrow compatibility pins in `programs/raid_settlement/Cargo.toml`: `blake3 = "=1.5.5"`, `proc-macro-crate = "=3.3.0"`, `indexmap = "=2.11.4"`, `unicode-segmentation = "=1.12.0"`, and `zeroize = "=1.8.2"`.
- Avoid broad `cargo update` unless the resulting graph is verified with `anchor test`.

Escalate if:
- Future dependency updates require upgrading Solana CLI, Anchor CLI, or the SBF toolchain.

## KI-014: Day 4 Room Authority Is In-Memory

Severity: medium.
Status: open, non-blocking for local Day 4 demo.

Issue: the Day 4 create/join room flow uses in-memory Next route handlers as the local authoritative snapshot service. It validates client input, shares snapshots across browser clients, supports reconnect by room code plus player id, and is adequate for local demo smoke tests, but room state resets when the Next process restarts and does not yet route every gameplay input through the MagicBlock `RaidState` PDA.

Mitigation:
- Keep the limitation visible in `docs/PROGRESS.md`.
- Use the verified `MB-004` MagicBlock lifecycle smoke as the proof that the compact `RaidState` can be initialized, delegated, mutated, committed, undelegated, and read back on devnet.
- During `SOL-003` or a dedicated networking hardening pass, replace or augment the in-memory room authority with a durable service and connect final gameplay mutations to the MagicBlock path.

Escalate if:
- The demo target requires cross-device hosted rooms before a production room service is implemented.
- The Day 6 settlement flow needs room state after a server restart.

## KI-015: MagicBlock Rust SDK Needs Local SBF Compatibility Patch

Severity: medium.
Status: mitigated for `MB-002`.

Issue: the official `ephemeral-rollups-sdk@0.16.2` crate graph pulled unused VRF/action-delegation and newer Solana dependency paths that reached crates such as `wincode`/`wincode-derive`. Those crates require edition 2024 or a newer Rust compiler than the Solana CLI `2.1.21` SBF toolchain provides through Cargo/Rust `1.79`.

Mitigation:
- Keep the local `[patch.crates-io]` entries in the root `Cargo.toml`.
- Keep the vendored MagicBlock crates under `vendor/`.
- The patch preserves the `#[ephemeral]`, `#[delegate]`, `delegate_pda`, `DelegateConfig`, and `MagicIntentBundleBuilder` APIs used by `MB-002`.
- Verify any MagicBlock Rust dependency change with `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'` before trusting it.
- See `D-022` in `docs/DECISIONS.md`.

Escalate if:
- Future work needs VRF, action-delegation, session-key program integration inside the Anchor program, or MagicBlock crate surfaces trimmed by the local compatibility patch.
- `anchor test` starts failing with Rust edition, `wincode`, Solana 3.x, or SBF toolchain errors.

## KI-016: MagicBlock Failure Modes And Fallbacks

Severity: medium.
Status: open.

Issue: MagicBlock public devnet, Magic Router, ER Asia, Solana devnet, validator routing, delegation status, and commit/undelegation account wiring can fail independently during development or demo rehearsal.

Latest verification:
- `MB-004` live devnet lifecycle smoke passed on 2026-08-04: deploy, initialize, delegate, `isDelegated: true`, router-routed hit, commit/undelegate, `isDelegated: false`, and final devnet state readback all succeeded.

Mitigation:
- MagicBlock smoke command: run `zsh -lic 'npm run magicblock:smoke'` from `frontend/` before demos and after dependency changes.
- Live lifecycle smoke command: run `zsh -lic 'npm run magicblock:live-smoke'` from `frontend/` before claiming the deployed program path still works.
- If MagicBlock smoke cannot reach Magic Router or ER Asia, fall back to Solana devnet/local deterministic state in the UI and do not claim live ER authority until smoke passes again.
- If `getClosestValidator` returns a validator other than `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57`, record the value and confirm whether router geography changed before hardcoding assumptions.
- If `getDelegationStatus` returns `isDelegated: false` for the `RaidState` PDA before a live delegate transaction, treat that as normal readiness, not a failure.
- If `getDelegationStatus` returns `isDelegated: false` after a delegate transaction, verify the program id, PDA seed `raid-state`, authority wallet, funding, and the validator remaining account used by `delegate_raid`.
- If gameplay mutation fails after delegation, route transactions through Magic Router and verify the signer is the stored `RaidState.authority`.
- If `commit_raid` or `commit_and_undelegate_raid` fails, surface a pending settlement state, keep the final local/ER snapshot visible, retry `commit_raid` first, and only show final settlement after base-layer state is readable.
- If shell startup warnings appear under `zsh -lic` but the command exits 0, treat them as non-blocking local shell initialization noise.

Escalate if:
- MagicBlock smoke fails repeatedly from the same network.
- A funded devnet authority cannot initialize, delegate, mutate, commit, and undelegate the `RaidState` PDA.
- The fallback path becomes the only demo path by the end of Day 2.

## KI-017: Devnet Program ID Depends On Ignored Local Deploy Keypair

Severity: low.
Status: open local environment issue, mitigated by live deployment.

Issue: the deployed devnet program ID `2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72` comes from `target/deploy/raid_settlement-keypair.json`, and `target/` is intentionally ignored. The program is already deployed on Solana devnet and upgrade authority is the local devnet authority, but a fresh clone will not contain the original initial-deploy keypair unless it is supplied separately.

Mitigation:
- Keep the program ID recorded in `Anchor.toml`, `programs/raid_settlement/src/lib.rs`, and frontend MagicBlock constants.
- Use the current local workspace for upgrades while the hackathon demo depends on this exact devnet program.
- If the deploy keypair is unavailable in a fresh environment and the program must be redeployed from scratch, generate a new program keypair, update all recorded program IDs, redeploy, and rerun `npm run magicblock:live-smoke`.

Escalate if:
- A different machine must upgrade the same devnet program and cannot access the current upgrade authority/keypair setup.
