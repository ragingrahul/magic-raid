# Bootstrap Planning Agent

You are setting up the planning and execution system for a one-week hackathon project.

## Project concept

The project is an Adaptive AI Raid Boss built for the MagicBlock Blitz hackathon.

It is a browser-based, cooperative, top-down 2D boss fight for 2–8 players.

Players fight one shared boss in real time. The boss periodically analyzes team behaviour and activates a constrained counter-strategy.

Examples:

- Players stay clustered -> boss activates an area attack.
- Ranged attacks dominate -> boss activates a leap attack.
- Magic damage dominates -> boss gains temporary magic resistance.
- Healing is frequent -> boss targets the healer.
- Melee damage dominates -> boss activates retaliation.

MagicBlock Ephemeral Rollups provide low-latency authoritative game execution.

An LLM acts only as a high-level strategist. It may select one strategy from an approved enum. It may not set arbitrary damage, change player HP, transfer assets, or modify unrestricted state.

The final raid result and contribution scores settle to Solana.

## Target stack

- Next.js
- React
- TypeScript
- Phaser 3
- Tailwind CSS
- Anchor
- Rust
- Solana
- MagicBlock Ephemeral Rollups
- Magic Router
- Solana wallet integration
- Zod
- LLM structured JSON output
- Vitest
- Anchor tests
- Vercel

## Time constraint

The entire project must be completed in seven days by one developer using AI coding agents.

The implementation must optimize for:

1. Reliable live demonstration.
2. Clear use of MagicBlock.
3. Small implementation scope.
4. Easy browser access.
5. Visible AI adaptation.
6. Final Solana settlement.
7. Recoverable failures.
8. Minimal unnecessary infrastructure.

## MVP

- One arena.
- One boss.
- Three player classes:
  - Warrior
  - Ranger
  - Mage
- Basic movement.
- One normal attack per class.
- One special ability per class.
- Five boss attacks.
- Three boss phases.
- 2–4 players in the primary demonstration.
- Up to 8 players if practical.
- One or two AI adaptations per match.
- Three-minute raid.
- Contribution scoring.
- Victory, defeat, and timeout.
- Wallet connection.
- Session authorization if supported.
- Final result settled to Solana.

## Out of scope

- 3D.
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

## Required documents

Generate complete first drafts for:

- docs/PROJECT.md
- docs/ARCHITECTURE.md
- docs/ROADMAP.md
- docs/SPRINT.md
- docs/TASKS.md
- docs/DECISIONS.md
- docs/PROGRESS.md
- docs/KNOWN_ISSUES.md

Generate specialist agent instructions for:

- prompts/planner.md
- prompts/architect.md
- prompts/frontend.md
- prompts/backend.md
- prompts/solana.md
- prompts/reviewer.md
- prompts/qa.md
- prompts/demo.md

## Rules

1. Inspect the existing repository before writing.
2. Do not overwrite useful existing content without preserving it.
3. Do not implement application code.
4. Do not install dependencies.
5. Do not invent MagicBlock APIs.
6. Clearly mark assumptions requiring documentation verification.
7. Keep plans realistic for seven days.
8. Prioritize the critical path:
   MagicBlock proof -> local game -> multiplayer -> boss engine -> AI -> polish -> demo.
9. Separate required tasks from optional tasks.
10. Every task must have measurable acceptance criteria.
11. Every task must define relevant verification commands.
12. Use task IDs such as MB-001.
13. Identify dependencies between tasks.
14. Include stopping rules and escalation conditions for coding agents.
15. The documents must agree with each other.

## Required workflow

First inspect:

- Repository tree.
- Existing package manifests.
- Existing Anchor workspace.
- Existing frontend or backend code.
- Existing documentation.

Then provide a short repository assessment.

Next generate documents in this order:

1. PROJECT.md
2. ARCHITECTURE.md
3. ROADMAP.md
4. DECISIONS.md
5. TASKS.md
6. SPRINT.md
7. PROGRESS.md
8. KNOWN_ISSUES.md
9. Specialist prompt files

After writing, perform a consistency review:

- Does every roadmap milestone have tasks?
- Does every sprint task exist in TASKS.md?
- Are architecture decisions recorded in DECISIONS.md?
- Does PROGRESS.md reflect the actual repository?
- Are unresolved risks present in KNOWN_ISSUES.md?
- Do specialist prompts reference the same paths and rules?

At completion, report:

- Files created or updated.
- Important assumptions.
- Immediate blockers.
- Recommended first task.