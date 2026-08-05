# MagicRaid Frontend

Next.js App Router scaffold for the Adaptive AI Raid Boss demo.

## Commands

Run commands from this directory through the project login shell:

```bash
zsh -lic 'pnpm install'
zsh -lic 'pnpm run typecheck'
zsh -lic 'pnpm run lint'
zsh -lic 'pnpm run test'
zsh -lic 'pnpm run dev'
```

## Environment

Copy `.env.example` to `.env.local` for local development and set `OPENAI_API_KEY`.
Keep the key server-side only; do not prefix it with `NEXT_PUBLIC_`.

Optional strategy settings:

- `OPENAI_STRATEGY_MODEL`: defaults to `gpt-5.6`.
- `OPENAI_STRATEGY_TIMEOUT_MS`: defaults to `2500`.

Optional Day 6 authority and settlement settings:

- `MAGICRAID_ROOM_STATE`: set to `onchain` to make room create/join/read use the Solana devnet `RaidState` roster. `MAGICRAID_MAGICBLOCK_AUTHORITY=live` also enables this automatically.
- `MAGICRAID_ROOM_KEYPAIR`: funded devnet authority keypair path or JSON secret for on-chain room roster writes. Falls back to `MAGICRAID_MAGICBLOCK_KEYPAIR`, `MAGICRAID_SETTLEMENT_KEYPAIR`, `SOLANA_KEYPAIR`, and then `~/.config/solana/id.json`.
- `MAGICRAID_MAGICBLOCK_AUTHORITY`: set to `live` to initialize/delegate per-room `RaidState` PDAs and route combat hits through Magic Router; any other value keeps local fallback mode.
- `MAGICRAID_MAGICBLOCK_KEYPAIR`: funded devnet authority keypair path or JSON secret for live MagicBlock routing. Falls back to `MAGICRAID_SETTLEMENT_KEYPAIR`, `SOLANA_KEYPAIR`, and then `~/.config/solana/id.json`.
- `MAGICRAID_SETTLEMENT_MODE`: leave unset for Solana devnet settlement; set to `local` only for local-verified settlement rehearsal without sending a devnet transaction.
- `MAGICRAID_SETTLEMENT_KEYPAIR`: funded devnet authority keypair path or JSON secret for live settlement. Falls back to `SOLANA_KEYPAIR` and then `~/.config/solana/id.json`.

In live/on-chain mode, the room roster, player classes, lifecycle, boss HP, elapsed seconds, strategy, and contribution damage are canonical in the per-room `RaidState` PDA. The Next room store is a fast cache for display names, movement/interpolation, analytics, and UI session state.

Live devnet verification commands:

```bash
zsh -lic 'npm run magicblock:smoke'
zsh -lic 'npm run magicblock:live-smoke'
zsh -lic 'npm run magicblock:settlement-smoke'
```

## Stack

- Next.js `16.2.12`
- React `18.2.0`
- TypeScript `5.9.3`
- Tailwind CSS `4.3.3`
- Phaser `3.90.0`
- Zod `4.4.3`
- Vitest `4.1.10`
- MagicBlock ER SDK `0.16.2`

Session Keys frontend support with `@magicblock-labs/gum-react-sdk@3.0.10` is verified but deferred until the Session Keys implementation task, after basic ER delegation works.
