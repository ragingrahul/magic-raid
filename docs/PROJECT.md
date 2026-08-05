# Project: Adaptive AI Raid Boss

Adaptive AI Raid Boss is a browser-based, real-time, cooperative raid game for a one-week MagicBlock Blitz hackathon.

2-8 players fight one shared boss in a top-down 2D arena. MagicBlock Ephemeral Rollups provide the low-latency authoritative execution layer for combat state. A constrained AI strategist periodically analyzes team behaviour and selects one approved counter-strategy. Solana stores the live room roster plus the final verifiable raid result and contribution scores.

## Repository Assessment

Assessment date: 2026-08-05.

Current repository state:
- `docs/` exists and contains planning documents.
- `prompts/` exists and contains specialist agent prompt files.
- `frontend/` contains the Next.js, TypeScript, Tailwind CSS, Phaser 3 room game, wallet UI, analytics/AI panel, authority panel, settlement panel/API route, Zod, Vitest, and ESLint scaffold.
- `Anchor.toml`, root `Cargo.toml`, and `programs/raid_settlement/` contain the Anchor per-room MagicBlock `RaidState` and bounded settlement program.
- `backend/` is still an empty placeholder.

Implication: live devnet room roster, combat, settlement, Day 7 demo hardening, fallback rehearsal, and visible adaptation polish are now available in this workspace. The next work is live preflight rehearsal before judging, optional 5-8 player capacity testing, and production hosting only if the required demo stays stable.

## Core Concept

Players choose one of three classes and fight a single boss:
- Warrior: close-range durable attacker.
- Ranger: ranged sustained damage.
- Mage: burst magic damage and utility.

The boss has deterministic attacks and phases, but can receive high-level strategic direction from an LLM.

Examples:
- Players remain clustered -> boss unlocks an area attack.
- Ranged damage dominates -> boss uses a leap attack.
- Magic damage dominates -> boss gains temporary magic resistance.
- Healing is frequent -> boss prioritizes the healer.
- Melee damage dominates -> boss activates retaliation.

The AI may only select a strategy from an approved enum. It must never set arbitrary damage values, player balances, token transfers, boss HP, cooldowns, raid status, or unrestricted program state.

## Hackathon Story

The demo should make this sequence obvious:

1. Players create or join a raid using a room code.
2. The same boss state is synchronized for all players.
3. MagicBlock is the authoritative real-time execution layer.
4. The analytics panel identifies the team's current behaviour.
5. The AI strategist selects an approved counter-strategy.
6. The boss visibly changes behaviour.
7. The raid ends in victory, defeat, or timeout.
8. The final result and contribution scores settle to Solana.

## Target Stack

- Next.js with App Router
- React
- TypeScript with strict mode
- Phaser 3
- Tailwind CSS
- Anchor and Rust
- Solana
- MagicBlock Ephemeral Rollups
- Magic Router
- Solana wallet integration
- Zod
- LLM API with structured JSON output
- Vitest
- Anchor tests
- Vercel

## MVP Scope

Required:
- One 2D arena.
- One boss.
- 2-4 players in the primary demonstration.
- Up to 8 players if practical.
- Three classes: Warrior, Ranger, Mage.
- Basic movement.
- One normal attack per class.
- One special ability per class.
- Five boss attacks.
- Three boss phases.
- One or two AI adaptations per raid.
- Three-minute raid timer.
- Contribution scoring.
- Victory, defeat, and timeout states.
- Wallet connection.
- Session authorization if supported by verified MagicBlock APIs.
- Final result settled to Solana.

Optional only after the required demo works:
- 5-8 player stress demo.
- Extra visual polish.
- Additional boss tells or UI hints.
- Reconnect polish beyond basic snapshot recovery.

## Explicitly Out Of Scope

- 3D graphics.
- Voice chat.
- Open world.
- Multiple maps.
- Multiple bosses.
- Marketplace.
- Token economy.
- Complex NFTs.
- Persistent inventory.
- AI-generated executable game logic.
- AI-controlled arbitrary state.
- Machine-learning training.
- Perfect physics synchronization.
- Mobile-first design.
- Sending one blockchain transaction per rendered frame.

## Engineering Principles

1. Build the smallest reliable implementation.
2. Do not invent SDK methods or APIs.
3. Check installed package versions and official documentation before using APIs.
4. Separate authoritative state from visual state.
5. Phaser renders at 60 FPS, but authoritative updates may run less frequently.
6. Validate every LLM response with Zod.
7. Always provide deterministic fallbacks.
8. Keep account structures and instructions small.
9. Use checked arithmetic in Rust.
10. Validate signers, account ownership, raid status, cooldowns, and bounds.
11. Do not add new dependencies without explaining why.
12. Do not add features outside the current stage.
13. Preserve working code unless modification is necessary.
14. Run relevant tests and type checks after every task.
15. Report uncertainty instead of fabricating an implementation.

## Success Criteria

The hackathon demo is successful when:

1. A player creates a raid.
2. Other players join using a room code.
3. Players fight the same synchronized boss.
4. The analytics panel identifies the team strategy.
5. The AI selects an approved counter-strategy.
6. The boss visibly changes behaviour.
7. The raid reaches victory or defeat.
8. The final result and contribution scores settle to Solana.

## Immediate Next Task

`MB-001` through `MB-004`, `APP-001`, `GAME-001` through `GAME-005`, `NET-001` through `NET-003`, `WEB-001` through `WEB-003`, `AI-001` through `AI-003`, `SOL-001` through `SOL-003`, `QA-001` through `QA-004`, `DEMO-001`, `DEMO-002`, and `POLISH-001` are complete; see `docs/MAGICBLOCK_VERIFICATION.md`, `docs/DEMO.md`, and `docs/PROGRESS.md`.

Next begin:
- Live devnet preflight rehearsal using `docs/DEMO.md`.
- `OPT-001` only if the required 2-4 player demo remains stable.
- Production hosting only after the local and live judging flow is repeatable.

Toolchain note: in this Codex environment, run package manager, Rust, Solana, and Anchor commands through `zsh -lic`. Run Rust and Anchor verification with `CARGO_HOME="$PWD/.cargo-home"` from the repository root.
