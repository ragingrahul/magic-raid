# MagicRaid Demo Script

Day 7 operator artifact for `DEMO-001` and `DEMO-002`.

Primary demo target: MagicBlock public devnet, Asia ER validator, Magic Router, and Solana devnet settlement.

## Preflight Checklist

Run from the repository root unless a command says `frontend/`.

Required local services and credentials:
- Devnet authority wallet has SOL.
- `frontend/.env.local` exists for the intended demo mode.
- Browser has one host tab and one guest tab or two browser profiles.
- Screen share is zoomed so the arena, `AI Strategy`, `Authority`, and `Settlement` panels are visible.

Live devnet environment:

```sh
MAGICRAID_ROOM_STATE=onchain
MAGICRAID_MAGICBLOCK_AUTHORITY=live
MAGICRAID_SETTLEMENT_MODE=
MAGICRAID_ROOM_KEYPAIR=/absolute/path/to/funded-devnet-keypair.json
MAGICRAID_MAGICBLOCK_KEYPAIR=/absolute/path/to/funded-devnet-keypair.json
MAGICRAID_SETTLEMENT_KEYPAIR=/absolute/path/to/funded-devnet-keypair.json
OPENAI_API_KEY=...
```

Local-verified rehearsal environment:

```sh
MAGICRAID_SETTLEMENT_MODE=local
```

Verification before judges enter:

```sh
zsh -lic 'npm run test'
zsh -lic 'npm run magicblock:smoke'
zsh -lic 'npm run magicblock:live-smoke'
zsh -lic 'npm run magicblock:settlement-smoke'
zsh -lic 'CARGO_HOME="$PWD/.cargo-home" anchor test'
```

Start the app:

```sh
cd frontend
zsh -lic 'npm run dev -- --port 3000'
```

Open `http://localhost:3000`.

## Main Script

Target length: 4-6 minutes.

1. Create the room, 20 seconds.
   - Host connects an injected wallet, or uses `Demo Wallet` if the wallet extension is not available.
   - Host chooses `Warrior` and selects `Create Room`.
   - Say: “The room gets a compact per-room `RaidState`; the UI will show whether combat is live through MagicBlock or in local fallback.”
   - Visible proof: `Authority` panel shows `MagicBlock live`, `Combat: Router`, a `RaidState`, and room code.

2. Join the room, 30 seconds.
   - Guest uses a separate tab/profile, connects a wallet or `Demo Wallet`, chooses `Ranger` or `Mage`, enters the room code, and selects `Join Room`.
   - Say: “The roster is written to the same room state, while Phaser keeps movement smooth locally.”
   - Visible proof: both clients show the same boss HP and roster count.

3. Trigger synchronized combat, 45 seconds.
   - Host moves near the boss and uses `Strike`.
   - Guest uses repeated `Strike`/`Special`.
   - Say: “Combat-critical hit mutations route through Magic Router in live mode; movement remains low-latency room-server state.”
   - Visible proof: boss HP drops on both clients, `Authority` shows a recent signature, and player contribution damage increases.

4. Trigger AI adaptation, 45-75 seconds.
   - For `leap_to_ranged`: keep a Ranger far from the boss and attack repeatedly.
   - For `magic_resistance`: use a Mage as the dominant damage source.
   - For `area_denial`: cluster both players close together.
   - Say: “Only validated analytics are sent to the strategy selector. The output can choose one approved strategy, not arbitrary HP or damage.”
   - Visible proof: `AI Strategy` shows the last decision and the arena changes boss tell color/shape within five seconds of a strategy update.

5. End the raid, 60-120 seconds.
   - Continue attacking until victory. If time is tight, use strong class specials and keep players in range.
   - Say: “The terminal summary is bounded and must match the MagicBlock-authoritative contribution damage.”
   - Visible proof: status changes to `victory`, `defeat`, or `timeout`; settlement button becomes available once every player has a wallet.

6. Submit settlement, 30-60 seconds.
   - Select `Submit Settlement`.
   - Say: “The room state commits and undelegates, then the final result is recorded on Solana devnet. If local mode is configured, the UI labels it local-verified.”
   - Visible proof: `Settlement` panel shows `success` with an explorer link and record PDA, or `local verified` with an explicit local status.

## Strategy Tells

Each approved boss strategy has a short visual tell:
- `area_denial`: warning rings around the fight center.
- `leap_to_ranged`: a teal targeting line toward the farthest player.
- `magic_resistance`: a violet ward around the boss.
- `focus_healer`: a red reticle on the weakest player.
- `melee_retaliation`: close-range spikes around the boss.

## Reset Procedure

Between runs:
- Select `Leave` in every browser tab.
- Disconnect or replace demo wallets if a clean roster is needed.
- Refresh all tabs.
- Create a new room code.

If the room service needs a hard reset:
- Stop `npm run dev`.
- Restart `npm run dev -- --port 3000`.
- Create a new room.

If live MagicBlock state looks stale:
- Use a fresh room code.
- Run `zsh -lic 'npm run magicblock:smoke'` from `frontend/`.
- If smoke passes but the app stays degraded, continue with the MagicBlock fallback below and do not claim live router authority for that run.

## Fallback Runbook

### MagicBlock Connectivity Issue

Symptoms: `Authority` shows `Local fallback`, router requests fail, or smoke cannot read delegation status.

Still live:
- Browser room flow.
- Deterministic combat rules.
- AI analytics and strategy selection.
- Explicit local settlement rehearsal if configured.

Degraded:
- Combat-critical mutation is not being confirmed through Magic Router for that run.

Continue:
- Say: “This run is in local fallback; the MagicBlock proof is the passing smoke/live-smoke output from preflight.”
- Show the `Authority` panel so the degradation is visible.
- Continue through AI and local-verified settlement.

### LLM Timeout Or Invalid Response

Symptoms: `AI Strategy` decision source shows `fallback`, or strategy route returns a validation/timeout message.

Still live:
- Analytics generation.
- Zod validation.
- Deterministic fallback strategy selection.
- Boss strategy application if the fallback changes strategy.

Degraded:
- The strategy source is fallback, not OpenAI.

Continue:
- Say: “The selector failed closed into a deterministic approved strategy.”
- Keep fighting and show the source label in `AI Strategy`.

### Wallet Issue

Symptoms: injected wallet is unavailable, locked, or rejects connection.

Still live:
- Room creation and join with `Demo Wallet`.
- Local browser gameplay.
- Settlement rehearsal if all players use demo wallets.

Degraded:
- The connected address is not an injected user wallet.

Continue:
- Select `Demo Wallet`.
- Say: “For the demo, this is a generated devnet-format address; the UI labels the source.”
- If live on-chain create/join needs a funded signing authority, keep using the server authority keypair.

### Solana Transaction Failure

Symptoms: settlement status becomes `failed`, explorer link is absent, or devnet RPC times out.

Still live:
- Terminal game state.
- Bounded settlement summary construction.
- MagicBlock or local authority state shown in the UI.

Degraded:
- The final devnet settlement transaction did not land in this run.

Continue:
- Keep the failure visible in `Settlement`.
- Say: “The app did not hide the network failure; here is the local summary and the preflight settlement smoke for a landed transaction.”
- If configured, switch to `MAGICRAID_SETTLEMENT_MODE=local` for a local-verified rehearsal and label it as such.

### Multiplayer Join Failure

Symptoms: guest sees `Room code is invalid or expired`, room is full, or the tab cannot recover a snapshot.

Still live:
- Host single-client arena.
- Room API error handling.
- Reset path.

Degraded:
- Multi-client synchronized view is not available until reset.

Continue:
- Create a fresh room code.
- Keep to 2 clients.
- If joining still fails, demo one client and show the API/browser smoke notes from `docs/PROGRESS.md`.
