# Tasks

Task IDs are stable references for agents. Required tasks block the MVP demo. Optional tasks can be skipped if the core demo is at risk.

Each task lists measurable acceptance criteria and expected verification commands. Some commands will only exist after `APP-001` or `SOL-001` scaffolds the workspace.

## Planning

### PLAN-001: Bootstrap planning documents

Priority: required.
Dependencies: none.

Acceptance criteria:
- `docs/PROJECT.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SPRINT.md`, `docs/TASKS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, and `docs/KNOWN_ISSUES.md` exist.
- Documents agree on MVP scope, critical path, and out-of-scope items.
- Current empty repository state is documented.

Verification commands:
- `rg --files docs prompts`
- `git diff -- docs prompts`

### PLAN-002: Bootstrap specialist prompts

Priority: required.
Dependencies: `PLAN-001`.

Acceptance criteria:
- `prompts/planner.md`, `prompts/architect.md`, `prompts/frontend.md`, `prompts/backend.md`, `prompts/solana.md`, `prompts/reviewer.md`, `prompts/qa.md`, and `prompts/demo.md` exist.
- Each prompt references `docs/PROJECT.md`, `docs/TASKS.md`, and relevant stopping rules.
- Prompts do not authorize agents to invent MagicBlock APIs or add out-of-scope features.

Verification commands:
- `rg "Do not invent MagicBlock APIs|docs/TASKS.md|stopping" prompts`

## MagicBlock

### MB-001: Verify MagicBlock and Magic Router integration path

Priority: required.
Dependencies: `PLAN-001`.

Acceptance criteria:
- Official MagicBlock documentation and installed package versions are checked before coding.
- Exact supported APIs for Ephemeral Rollups, Magic Router, Asia validator delegation, commit/undelegation, and session authorization are recorded.
- Confirmed package names and versions are recorded before implementation.
- Local toolchain availability is recorded, including blockers.
- `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and `docs/KNOWN_ISSUES.md` are updated if verification changes the plan.

Verification commands:
- `rg "Selected MagicBlock Integration|D-013|D-017|KI-001" docs`
- `sed -n '1,260p' docs/MAGICBLOCK_VERIFICATION.md`
- Project-specific docs/package inspection command after scaffold.

### MB-002: Build minimal authoritative raid state spike

Priority: required.
Dependencies: `MB-001`, `APP-001`.

Acceptance criteria:
- A compact `RaidState` PDA can be delegated to the Asia ER validator, updated, committed, and undelegated through the verified MagicBlock path.
- At least one deterministic transition updates boss HP, player contribution, or raid timer.
- Clients cannot directly set final boss HP or arbitrary state.

Verification commands:
- `npm run typecheck`
- `npm run test`
- MagicBlock local/devnet smoke command documented in `docs/PROGRESS.md`.

### MB-003: Document MagicBlock runbook

Priority: required.
Dependencies: `MB-002`.

Acceptance criteria:
- `docs/PROGRESS.md` records setup, environment variables, and run commands.
- Known MagicBlock failure modes and fallback steps are listed in `docs/KNOWN_ISSUES.md`.
- A fresh agent can run the smoke test from documented commands.

Verification commands:
- `rg "MagicBlock runbook|MagicBlock smoke" docs/PROGRESS.md docs/KNOWN_ISSUES.md`

### MB-004: Run live MagicBlock devnet lifecycle smoke

Priority: required.
Dependencies: `MB-002`, `MB-003`, `SOL-001`.

Acceptance criteria:
- The settlement program is deployed or confirmed deployed on Solana devnet with the recorded program ID.
- A funded devnet authority initializes the `RaidState` PDA.
- `delegate_raid` delegates the `RaidState` PDA to the Asia ER validator.
- Magic Router reports `isDelegated: true` for the `RaidState` PDA after delegation.
- At least one deterministic gameplay mutation, starting with `apply_player_hit`, succeeds through the Magic Router path.
- `commit_and_undelegate_raid` completes or the exact MagicBlock account/runtime blocker is recorded.
- The final `RaidState` account can be read from Solana devnet or the exact blocker is recorded.

Verification commands:
- `zsh -lic 'solana balance --url devnet'`
- `zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor deploy --provider.cluster devnet'`
- Live lifecycle smoke command documented in `docs/PROGRESS.md`.

## App Scaffold

### APP-001: Scaffold frontend workspace

Priority: required.
Dependencies: `MB-001`.

Acceptance criteria:
- Next.js App Router, TypeScript strict mode, Tailwind CSS, Phaser 3, Zod, and Vitest are configured.
- Package versions are recorded in `docs/PROGRESS.md`.
- No extra dependencies are added without a note explaining why.
- `npm run typecheck` and `npm run test` exist.

Verification commands:
- `npm run typecheck`
- `npm run test`
- `npm run lint`

## Game

### GAME-001: Define shared game types and schemas

Priority: required.
Dependencies: `APP-001`.

Acceptance criteria:
- Types exist for raid status, player class, player state, boss state, attacks, strategies, analytics, and settlement summary.
- Zod schemas validate network-facing payloads and AI-facing summaries.
- Constants define bounds for players, cooldowns, arena size, raid duration, and score limits.

Verification commands:
- `npm run typecheck`
- `npm run test -- game`

### GAME-002: Implement Phaser arena and movement

Priority: required.
Dependencies: `GAME-001`.

Acceptance criteria:
- A player can move within arena bounds.
- Phaser renders the player, boss, arena, HP bars, and basic attack indicators.
- Visual state is separated from authoritative state snapshots.

Verification commands:
- `npm run typecheck`
- `npm run test -- game`
- Manual browser check documented in `docs/PROGRESS.md`.

### GAME-003: Implement class attacks and specials

Priority: required.
Dependencies: `GAME-002`.

Acceptance criteria:
- Warrior, Ranger, and Mage each have one normal attack and one special ability.
- Damage, cooldown, range, and effect values are deterministic constants.
- Cooldowns and bounds are enforced.

Verification commands:
- `npm run test -- game`

### GAME-004: Implement deterministic boss phases and attacks

Priority: required.
Dependencies: `GAME-003`.

Acceptance criteria:
- Boss supports three HP-based phases.
- Boss supports Cleave, Ground Slam, Leap, Arcane Shield, and Marked Strike.
- Boss attacks use deterministic cooldowns and target rules.
- AI strategy can influence attack preference without changing damage values.

Verification commands:
- `npm run test -- boss`

### GAME-005: Implement contribution scoring and terminal states

Priority: required.
Dependencies: `GAME-004`.

Acceptance criteria:
- Score includes bounded contributions for damage, survival, support, and objective completion.
- Raid reaches victory, defeat, or timeout.
- Terminal state cannot be changed once finalized except through settlement status.

Verification commands:
- `npm run test -- raid`

## Networking And Rooms

### NET-001: Connect clients to authoritative snapshots

Priority: required.
Dependencies: `MB-002`, `GAME-002`.

Acceptance criteria:
- 2-4 browser clients receive the same authoritative boss state.
- Client input is validated before authoritative processing.
- Snapshot interpolation keeps visuals smooth enough for demo.

Verification commands:
- `npm run typecheck`
- Multiplayer smoke command documented in `docs/PROGRESS.md`.

### NET-002: Add snapshot recovery and basic reconnect

Priority: optional.
Dependencies: `NET-001`.

Acceptance criteria:
- A reconnecting client can rejoin by room code and receive latest snapshot.
- Stale or invalid room codes show a recoverable UI error.
- Recovery steps are documented for demo operators.

Verification commands:
- `npm run test -- network`
- Manual reconnect test documented in `docs/PROGRESS.md`.

### NET-003: Route room gameplay authority through MagicBlock

Priority: required before claiming live MagicBlock room authority.
Dependencies: `NET-001`, `MB-004`, `GAME-005`.

Acceptance criteria:
- State-changing room inputs route through the verified Magic Router/MagicBlock authority path instead of only the in-memory Next room authority.
- The room service reconciles MagicBlock `RaidState` readbacks into the snapshots clients render.
- Movement and visual interpolation remain low-latency, but combat-critical mutations, raid terminal state, contribution damage, and final raid summary come from the MagicBlock-authoritative state.
- If full movement authority is deferred, the accepted split between visual movement intents and MagicBlock-critical gameplay mutations is documented before demo rehearsal.
- The UI clearly distinguishes live MagicBlock authority from local fallback mode.

Verification commands:
- `npm run typecheck`
- `npm run test -- network`
- MagicBlock-routed multiplayer smoke command documented in `docs/PROGRESS.md`.

## Web Experience

### WEB-001: Create room code flow

Priority: required.
Dependencies: `APP-001`.

Acceptance criteria:
- User can create a raid and receive a room code.
- Another user can join by room code.
- Invalid room code errors are visible and recoverable.

Verification commands:
- `npm run typecheck`
- Manual create/join check documented in `docs/PROGRESS.md`.

### WEB-002: Add wallet connection UI

Priority: required.
Dependencies: `APP-001`, `SOL-001`.

Acceptance criteria:
- Player can connect a Solana wallet.
- Wallet address is displayed in lobby or raid summary.
- Missing wallet does not block local game testing before settlement.

Verification commands:
- `npm run typecheck`
- Wallet connection manual check documented in `docs/PROGRESS.md`.

### WEB-003: Build analytics and strategy panel

Priority: required.
Dependencies: `AI-001`, `AI-003`.

Acceptance criteria:
- Panel shows cluster score, dominant damage type/class, healing frequency, boss phase, current strategy, and last AI decision.
- The panel updates during the raid.
- Strategy changes are visibly tied to boss behaviour.

Verification commands:
- `npm run typecheck`
- Browser demo checklist in `docs/PROGRESS.md`.

## AI

### AI-001: Implement raid analytics summary

Priority: required.
Dependencies: `GAME-001`, `GAME-003`.

Acceptance criteria:
- Recent gameplay is summarized into validated analytics.
- Summary detects clustered players, ranged dominance, magic dominance, frequent healing, and melee dominance.
- Analytics are deterministic and unit-tested.

Verification commands:
- `npm run test -- analytics`

### AI-002: Implement structured LLM strategy selection

Priority: required.
Dependencies: `AI-001`.

Acceptance criteria:
- LLM request contains only approved analytics, not private keys or unrestricted state.
- LLM response is validated with Zod.
- Output strategy must be one of the approved enum values.
- Invalid or timed-out responses return deterministic fallback.

Verification commands:
- `npm run test -- ai`
- `npm run typecheck`

### AI-003: Apply strategy safely to boss behaviour

Priority: required.
Dependencies: `AI-002`, `GAME-004`.

Acceptance criteria:
- Strategy changes are rate-limited to one or two adaptations per raid.
- Strategy affects attack selection or resistance mode through deterministic rules.
- Strategy cannot alter arbitrary damage, HP, or settlement fields.

Verification commands:
- `npm run test -- boss`
- `npm run test -- ai`

## Solana

### SOL-001: Scaffold Anchor settlement workspace

Priority: required.
Dependencies: `MB-001`.

Acceptance criteria:
- `Anchor.toml`, program directory, and initial test harness exist.
- Rust uses checked arithmetic for score aggregation.
- Program compiles with no settlement logic beyond skeleton.

Verification commands:
- `anchor test`
- `cargo test`

### SOL-002: Implement final settlement instruction

Priority: required.
Dependencies: `SOL-001`, `GAME-005`.

Acceptance criteria:
- Settlement records raid ID, creator/authority, result, duration, boss final HP, and bounded contribution scores.
- Settlement validates signer, raid status, duplicate settlement, score bounds, and player count.
- Anchor tests cover success and failure cases.

Verification commands:
- `anchor test`

### SOL-003: Connect settlement client flow

Priority: required.
Dependencies: `SOL-002`, `WEB-002`, `GAME-005`.

Acceptance criteria:
- Final raid summary can be submitted from the app.
- UI shows pending, success, and failure states.
- Transaction signature or explorer link is shown after success.

Verification commands:
- `npm run typecheck`
- `npm run test -- settlement`
- Manual settlement check documented in `docs/PROGRESS.md`.

## QA

### QA-001: Establish baseline verification commands

Priority: required.
Dependencies: `APP-001`.

Acceptance criteria:
- `npm run typecheck`, `npm run lint`, and `npm run test` are documented and pass.
- Failing commands are recorded in `docs/KNOWN_ISSUES.md`.

Verification commands:
- `npm run typecheck`
- `npm run lint`
- `npm run test`

### QA-002: Cover deterministic game and AI rules

Priority: required.
Dependencies: `GAME-005`, `AI-003`.

Acceptance criteria:
- Unit tests cover class attacks, boss attacks, phase transitions, analytics classification, AI schema validation, and fallback selection.
- Tests prove LLM output cannot set damage or HP.

Verification commands:
- `npm run test`

### QA-003: Cover settlement constraints

Priority: required.
Dependencies: `SOL-002`.

Acceptance criteria:
- Anchor tests cover valid settlement, invalid signer, duplicate settlement, invalid player count, invalid score bounds, and invalid terminal status.

Verification commands:
- `anchor test`

### QA-004: Browser demo path test

Priority: optional.
Dependencies: `WEB-003`, `SOL-003`.

Acceptance criteria:
- A scripted or manual browser checklist covers create, join, fight, AI adaptation, terminal result, and settlement.
- Screenshots or notes are attached in `docs/PROGRESS.md`.

Verification commands:
- `npm run dev`
- Browser checklist in `docs/PROGRESS.md`.

## Demo

### DEMO-001: Prepare demo script

Priority: required.
Dependencies: `SOL-003`, `WEB-003`.

Acceptance criteria:
- `docs/PROGRESS.md` links to a step-by-step demo script.
- Script includes expected timings, visible proof points, and what to say when AI adapts.
- Script includes a reset procedure.

Verification commands:
- Manual rehearsal recorded in `docs/PROGRESS.md`.

### DEMO-002: Prepare fallback runbook

Priority: optional.
Dependencies: `DEMO-001`.

Acceptance criteria:
- Fallbacks exist for LLM timeout, MagicBlock connectivity issue, wallet issue, and Solana transaction failure.
- Fallbacks preserve honesty about what is live versus simulated.

Verification commands:
- Manual fallback rehearsal recorded in `docs/PROGRESS.md`.

### POLISH-001: Improve visible adaptation

Priority: optional.
Dependencies: `AI-003`, `WEB-003`.

Acceptance criteria:
- Each approved strategy has a clear visual tell.
- Boss behaviour change is noticeable within five seconds.
- UI text is concise and does not explain implementation internals.

Verification commands:
- Manual browser check documented in `docs/PROGRESS.md`.

### OPT-001: Test 5-8 player capacity

Priority: optional.
Dependencies: `NET-001`.

Acceptance criteria:
- 5-8 clients can join a room in a controlled test.
- Any performance or synchronization limits are documented.
- No required demo stability is sacrificed to support this.

Verification commands:
- Multiplayer capacity test documented in `docs/PROGRESS.md`.
