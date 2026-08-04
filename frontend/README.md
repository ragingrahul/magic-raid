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
