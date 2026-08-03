# MagicBlock Verification

Verification date: 2026-08-03.

Task: `MB-001`.

Purpose: verify the Ephemeral Rollups, Magic Router, Session Keys, package, endpoint, and local toolchain facts needed before scaffolding application code.

## Sources Checked

- MagicBlock ER Quickstart: https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/quickstart
- MagicBlock Local Development: https://docs.magicblock.gg/pages/ephemeral-rollups-ers/how-to-guide/local-development
- Magic Router: https://docs.magicblock.gg/pages/ephemeral-rollups-ers/introduction/magic-router
- Router API `getDelegationStatus`: https://docs.magicblock.gg/api-reference/er-api/getDelegationStatus
- Session Keys program integration: https://docs.magicblock.gg/pages/tools/session-keys/integrating-sessions-in-your-program
- Session Keys frontend installation: https://docs.magicblock.gg/pages/tools/session-keys/installation
- Session Provider and Context: https://docs.magicblock.gg/pages/tools/session-keys/session-provider-and-context
- NPM registry package metadata.
- Crates index package metadata.

## Verified Network Choices

Use these for the MVP unless later smoke tests contradict them:

| Purpose | Endpoint or value | Verification |
| --- | --- | --- |
| Magic Router devnet RPC | `https://devnet-router.magicblock.app` | Docs list this as the public Magic Router devnet endpoint. `getDelegationStatus` returned a valid JSON-RPC result. |
| Magic Router devnet WebSocket | `wss://devnet-router.magicblock.app/` | Docs show this value for `ConnectionMagicRouter`. |
| Solana devnet RPC | `https://api.devnet.solana.com` | Docs list this endpoint. Local `getHealth` returned `ok`; `getVersion` returned Solana core `4.1.2`. |
| ER devnet Asia RPC | `https://devnet-as.magicblock.app` | Docs list this endpoint. Local `getHealth` returned `ok`; `getVersion` returned MagicBlock core `0.13.19`. |
| ER devnet Asia WebSocket | `wss://devnet-as.magicblock.app/` | Docs show this endpoint in the Anchor test example. |
| Asia ER validator public key | `MAS1Dt9qreoRMQ14YQuhg8UTZMMzDdKhmkZMECCzk57` | Docs list this key for both mainnet Asia and devnet Asia. |
| Delegation program | `DELeGGvXpWV2fqJUhqcF5ZSYMS4JTLjteaAMARRSaeSh` | Docs identify this as MagicBlock's Delegation Program. |
| Local ER validator public key | `mAGicPQYBMvcYveUZA5F5UNNwyHvfYh5xkLS2Fr1mev` | Docs list this for localnet. |

Notes:
- Magic Router does not appear to support generic `getHealth` or `getVersion`; both returned `Method not found`.
- Magic Router did respond to the documented `/getDelegationStatus` route with `{ "isDelegated": false }` for the system program address, confirming reachability and API shape.

## Verified SDK And Package Choices

Frontend/client:
- Use `@solana/web3.js`.
- Use `@magicblock-labs/ephemeral-rollups-sdk`.
- NPM latest checked: `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`.
- Docs show `ConnectionMagicRouter` imported from `@magicblock-labs/ephemeral-rollups-sdk`.

Anchor/Rust program:
- Use Rust crate `ephemeral-rollups-sdk` with `anchor` feature.
- Crates index latest checked: `ephemeral-rollups-sdk@0.16.2`.
- Docs command: `cargo add ephemeral-rollups-sdk --features anchor`.
- The 0.16.x crate exposes modern `anchor` and `anchor-compat` feature paths; final feature selection should match the Anchor version chosen during scaffold.

Session Keys:
- Program crate: `session-keys = { version = "3.1.1", features = ["no-entrypoint"] }`.
- Crates index latest checked: `session-keys@3.1.1`.
- Frontend package from docs: `@magicblock-labs/gum-react-sdk`.
- NPM latest checked: `@magicblock-labs/gum-react-sdk@3.0.10`.
- The package `@session-keys/anchor` was checked and was not found on NPM, so do not plan around it.

Local ER tooling:
- CLI package: `@magicblock-labs/ephemeral-validator`.
- NPM latest checked: `@magicblock-labs/ephemeral-validator@0.13.19`.
- Exposes binaries including `ephemeral-validator`, `mb-test-validator`, `rpc-router`, and `vrf-oracle`.

## Verified Program Integration Pattern

The Anchor program should:

- Add the `#[ephemeral]` macro to the Anchor `#[program]` module.
- Add a `delegate` instruction using the `#[delegate]` accounts macro.
- Mark the delegated PDA field with `#[account(mut, del)]`.
- Call generated `delegate_pda(...)` with `DelegateConfig`.
- Pass the selected Asia ER validator as the first remaining account during delegation.
- Use `MagicIntentBundleBuilder` for commit and undelegation flows.
- Use `.commit(&[...])` for a state sync without undelegation.
- Use `.commit_and_undelegate(&[...])` at raid end.
- Serialize modified Anchor account state before commit when mutation and commit happen in the same instruction.

The docs say older helpers such as `commit_accounts` and `commit_and_undelegate_accounts` are deprecated in favor of `MagicIntentBundleBuilder`.

## Verified RaidState Plan

The chosen MVP account model remains valid:

1. Initialize one bounded `RaidState` PDA on Solana devnet.
2. Delegate `RaidState` to the Asia ER validator.
3. Submit frequent gameplay instructions through Magic Router.
4. Commit during the raid only if needed for visibility/debugging.
5. Commit and undelegate `RaidState` at raid end.
6. Read the final state from Solana devnet for settlement display.

This does not require Magic Actions for the MVP. Magic Actions remain optional if later documentation or demo needs require an automatic post-commit base-layer instruction.

## Verified Session Keys Plan

Session Keys are feasible for the MVP, but should be implemented after basic ER delegation works.

Program-side pattern:
- Add `session-keys` crate with `no-entrypoint`.
- Import `SessionError`, `SessionToken`, `session_auth_or`, and `Session`.
- Derive `Session` on instruction account contexts that accept session authorization.
- Include optional `SessionToken` account with signer and authority constraints.
- Use `session_auth_or(...)` to allow either direct wallet authority or valid session token.

Frontend pattern:
- Install `@magicblock-labs/gum-react-sdk`.
- Wrap wallet contexts with `SessionWalletProvider`.
- Use `useSessionKeyManager(...)` and `useSessionWallet()`.
- Create a session for the target program before real-time gameplay.

Open implementation detail:
- Confirm how well `gum-react-sdk@3.0.10` works in Next.js App Router client components before relying on it in the demo path.

## Verified Local Development Options

Official docs list three local ER paths:

1. Fully local: `mb-test-validator` as base layer plus local `ephemeral-validator`.
2. Surfpool as local base-layer alternative plus local ER.
3. Local `ephemeral-validator` connected to public devnet.

For this project:
- Primary demo path should remain public devnet.
- Local ER should be used only for testing after the toolchain exists.
- The first practical local test path should be fully local or devnet-connected local ER, depending on how quickly Solana/Anchor setup works.

## Local Toolchain Check

Commands run:

```bash
zsh -lic 'node --version'
zsh -lic 'npm --version'
zsh -lic 'npx --version'
zsh -lic 'pnpm --version'
zsh -lic 'yarn --version'
zsh -lic 'rustc --version'
zsh -lic 'cargo --version'
zsh -lic 'solana --version'
zsh -lic 'anchor --version'
zsh -lic 'avm --version'
zsh -lic 'corepack --version'
zsh -lic 'which node; which npm; which pnpm; which rustc; which cargo; which solana; which anchor'
```

Initial non-interactive checks also ran:

```bash
solana --version
rustc --version
anchor --version
node --version
npm --version
cargo --version
corepack --version
which node
which npm
which npx
which yarn
which pnpm
which solana
```

Observed:
- Toolchain commands are available when run through the project folder's interactive login shell with `zsh -lic`.
- Plain non-interactive Codex PATH only exposes Codex's bundled `node`, so future toolchain commands should use `zsh -lic '...'`.
- `node --version`: `v22.14.0`.
- `npm --version`: `10.9.2`.
- `npx --version`: `10.9.2`.
- `pnpm --version`: `10.33.0`.
- `yarn --version`: `1.22.22`.
- `rustc --version`: `rustc 1.94.0 (4a4ef493e 2026-03-02)`.
- `cargo --version`: `cargo 1.94.0 (85eff7c80 2026-01-15)`.
- `solana --version`: `solana-cli 2.1.21 (src:8a085eeb; feat:1416569292, client:Agave)`.
- `anchor --version`: `anchor-cli 0.31.1`.
- `avm --version`: `avm 0.31.1`.
- `corepack --version`: `0.31.0`.
- `node`: `/Users/rahulrajsarma/.nvm/versions/node/v22.14.0/bin/node`.
- `npm`: `/Users/rahulrajsarma/.nvm/versions/node/v22.14.0/bin/npm`.
- `pnpm`: `/opt/homebrew/bin/pnpm`.
- `rustc`: `/Users/rahulrajsarma/.cargo/bin/rustc`.
- `cargo`: `/Users/rahulrajsarma/.cargo/bin/cargo`.
- `solana`: `/Users/rahulrajsarma/.local/share/solana/install/active_release/bin/solana`.
- `anchor`: `/Users/rahulrajsarma/.cargo/bin/anchor`.

Impact:
- MB-001 documentation verification is complete.
- `APP-001` and `SOL-001` can proceed if commands are invoked through `zsh -lic`.

## Recommended Scaffold Dependencies

Use:

APP-001 frontend dependencies:
- `@magicblock-labs/ephemeral-rollups-sdk@0.16.2`
- `@solana/web3.js` compatible with wallet adapter and MagicBlock SDK

Deferred Session Keys frontend dependency:
- `@magicblock-labs/gum-react-sdk@3.0.10`

Reason for deferral:
- Session Keys implementation starts after basic ER delegation works.
- Installing `gum-react-sdk` during APP-001 pulled a React Native peer chain that is unnecessary before Session Keys are wired.

Rust dependencies:
- `ephemeral-rollups-sdk = { version = "0.16.2", features = ["anchor"] }`
- `session-keys = { version = "3.1.1", features = ["no-entrypoint"] }`

Local development tool:
- `@magicblock-labs/ephemeral-validator@0.13.19`

Final Anchor dependency compatibility should be verified during `SOL-001`, because the local CLI is `anchor-cli 0.31.1` while the current MagicBlock docs mention Anchor `1.0.2` and `ephemeral-rollups-sdk@0.16.2` supports both modern and compatibility Anchor feature paths.

## MB-001 Result

Status: complete for planning and API/package verification.

Implementation note:
- Use `zsh -lic '...'` for Node, package manager, Rust, Cargo, Solana, and Anchor commands in this Codex environment.

Next task:
- `SOL-001` for Anchor scaffold.
