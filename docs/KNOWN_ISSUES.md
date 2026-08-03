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
Status: open.

Issue: `frontend/`, `backend/`, and `programs/` are empty. There are no build, typecheck, lint, or test commands.

Mitigation:
- Complete `APP-001` after `MB-001`.
- Keep dependencies minimal and document versions.

Escalate if:
- Dependency installation fails.
- The scaffold requires moving away from the agreed stack.

## KI-003: No Anchor Workspace Exists

Severity: high.
Status: open.

Issue: there is no `Anchor.toml`, `Cargo.toml`, or settlement program.

Mitigation:
- Complete `SOL-001` after MagicBlock verification.
- Keep settlement account structures small.

Escalate if:
- Anchor cannot compile locally.
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

## KI-010: Local Toolchain Is Missing

Severity: high.
Status: open.

Issue: this terminal has Codex's bundled `node` binary, but no package manager or Solana/Rust/Anchor toolchain on PATH. `npm`, `npx`, `yarn`, `pnpm`, `corepack`, `solana`, `rustc`, `cargo`, and `anchor` were not found.

Mitigation:
- Install or expose a project package manager before `APP-001`.
- Install or expose Rust/Cargo, Solana CLI, and Anchor CLI before `SOL-001`.
- After installation, rerun the version checks in `docs/MAGICBLOCK_VERIFICATION.md`.

Escalate if:
- The user wants Codex to install these tools, because that requires network access and changes outside the repo.
