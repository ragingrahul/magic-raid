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
