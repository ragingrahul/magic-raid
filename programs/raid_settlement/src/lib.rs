use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::{delegate, ephemeral},
    cpi::DelegateConfig,
    ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder},
};

declare_id!("2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72");

pub const MAX_PLAYERS: usize = 8;
pub const MAX_SCORE_COMPONENT: u16 = 10_000;
pub const MAX_TOTAL_SCORE: u16 = 40_000;
pub const RAID_STATE_SEED: &[u8] = b"raid-state";
pub const SETTLEMENT_RECORD_SEED: &[u8] = b"settlement-record";
pub const RAID_BOSS_MAX_HP: u16 = 1_200;
pub const MAX_HIT_DAMAGE: u16 = 250;
pub const RAID_DURATION_SECONDS: u16 = 180;

#[ephemeral]
#[program]
pub mod raid_settlement {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        msg!("Raid settlement scaffold initialized");
        Ok(())
    }

    pub fn initialize_raid(
        ctx: Context<InitializeRaid>,
        raid_id: [u8; 16],
        first_player: Pubkey,
        first_player_class: RaiderClass,
    ) -> Result<()> {
        ctx.accounts.raid_state.initialize(
            raid_id,
            ctx.accounts.authority.key(),
            first_player,
            first_player_class,
            ctx.bumps.raid_state,
        )
    }

    pub fn join_raid(
        ctx: Context<JoinRaid>,
        player: Pubkey,
        player_class: RaiderClass,
    ) -> Result<()> {
        ctx.accounts.raid_state.add_player(player, player_class)
    }

    pub fn apply_player_hit(
        ctx: Context<UpdateRaid>,
        player_index: u8,
        damage: u16,
        elapsed_delta_seconds: u16,
    ) -> Result<()> {
        ctx.accounts
            .raid_state
            .apply_player_hit(player_index, damage, elapsed_delta_seconds)
    }

    pub fn finalize_raid(
        ctx: Context<UpdateRaid>,
        result: RaidResult,
        elapsed_delta_seconds: u16,
    ) -> Result<()> {
        ctx.accounts
            .raid_state
            .finalize(result, elapsed_delta_seconds)
    }

    pub fn settle_raid(
        ctx: Context<SettleRaid>,
        result: RaidResult,
        duration_seconds: u16,
        boss_final_hp: u16,
        contributions: Vec<ContributionScore>,
    ) -> Result<()> {
        let slot = Clock::get()?.slot;
        ctx.accounts.settlement_record.settle_from_raid_state(
            &ctx.accounts.raid_state,
            ctx.accounts.authority.key(),
            result,
            duration_seconds,
            boss_final_hp,
            contributions,
            slot,
            ctx.bumps.settlement_record,
        )
    }

    pub fn delegate_raid(ctx: Context<DelegateRaid>, raid_id: [u8; 16]) -> Result<()> {
        let (expected_raid_state, _) =
            Pubkey::find_program_address(&[RAID_STATE_SEED, &raid_id], ctx.program_id);
        require_keys_eq!(
            ctx.accounts.pda.key(),
            expected_raid_state,
            SettlementError::InvalidRaidStatePda
        );

        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[RAID_STATE_SEED, &raid_id],
            DelegateConfig {
                validator: ctx.remaining_accounts.first().map(|account| account.key()),
                ..DelegateConfig::default()
            },
        )?;
        Ok(())
    }

    pub fn commit_raid(ctx: Context<CommitRaid>) -> Result<()> {
        commit_raid_state(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
            ctx.accounts.raid_state.to_account_info(),
            false,
        )
    }

    pub fn commit_and_undelegate_raid(ctx: Context<CommitRaid>) -> Result<()> {
        commit_raid_state(
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.magic_context.to_account_info(),
            ctx.accounts.magic_program.to_account_info(),
            ctx.accounts.raid_state.to_account_info(),
            true,
        )
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
#[instruction(raid_id: [u8; 16], first_player: Pubkey, first_player_class: RaiderClass)]
pub struct InitializeRaid<'info> {
    #[account(
        init,
        payer = authority,
        space = RaidState::SPACE,
        seeds = [RAID_STATE_SEED, raid_id.as_ref()],
        bump
    )]
    pub raid_state: Account<'info, RaidState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinRaid<'info> {
    #[account(
        mut,
        seeds = [RAID_STATE_SEED, raid_state.raid_id.as_ref()],
        bump = raid_state.bump,
        has_one = authority
    )]
    pub raid_state: Account<'info, RaidState>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateRaid<'info> {
    #[account(
        mut,
        seeds = [RAID_STATE_SEED, raid_state.raid_id.as_ref()],
        bump = raid_state.bump,
        has_one = authority
    )]
    pub raid_state: Account<'info, RaidState>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct SettleRaid<'info> {
    #[account(
        mut,
        seeds = [RAID_STATE_SEED, raid_state.raid_id.as_ref()],
        bump = raid_state.bump,
        has_one = authority
    )]
    pub raid_state: Account<'info, RaidState>,
    #[account(
        init,
        payer = authority,
        space = SettlementRecord::SPACE,
        seeds = [SETTLEMENT_RECORD_SEED, raid_state.key().as_ref()],
        bump
    )]
    pub settlement_record: Account<'info, SettlementRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[delegate]
#[derive(Accounts)]
pub struct DelegateRaid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: The `#[delegate]` macro verifies the canonical MagicBlock
    /// delegation buffer, record, metadata, owner, and program accounts.
    #[account(mut, del)]
    pub pda: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CommitRaid<'info> {
    #[account(
        mut,
        seeds = [RAID_STATE_SEED, raid_state.raid_id.as_ref()],
        bump = raid_state.bump,
        has_one = authority
    )]
    pub raid_state: Account<'info, RaidState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: MagicBlock context account required by the Magic program CPI.
    #[account(mut)]
    pub magic_context: AccountInfo<'info>,
    pub magic_program: Program<'info, MagicProgram>,
}

fn commit_raid_state<'info>(
    authority: AccountInfo<'info>,
    magic_context: AccountInfo<'info>,
    magic_program: AccountInfo<'info>,
    raid_state: AccountInfo<'info>,
    undelegate: bool,
) -> Result<()> {
    let builder = MagicIntentBundleBuilder::new(authority, magic_context, magic_program);

    if undelegate {
        builder
            .commit_and_undelegate(&[raid_state])
            .build_and_invoke()?;
    } else {
        builder.commit(&[raid_state]).build_and_invoke()?;
    }

    Ok(())
}

#[account]
#[derive(Debug)]
pub struct RaidState {
    pub raid_id: [u8; 16],
    pub authority: Pubkey,
    pub lifecycle: RaidLifecycle,
    pub boss_hp: u16,
    pub boss_max_hp: u16,
    pub player_count: u8,
    pub elapsed_seconds: u16,
    pub strategy: RaidStrategy,
    pub contribution_damage: [u16; MAX_PLAYERS],
    pub player_wallets: [Pubkey; MAX_PLAYERS],
    pub player_classes: [RaiderClass; MAX_PLAYERS],
    pub bump: u8,
}

impl RaidState {
    pub const SPACE: usize = 8
        + 16
        + 32
        + 1
        + 2
        + 2
        + 1
        + 2
        + 1
        + (MAX_PLAYERS * 2)
        + (MAX_PLAYERS * 32)
        + MAX_PLAYERS
        + 1;

    pub fn initialize(
        &mut self,
        raid_id: [u8; 16],
        authority: Pubkey,
        first_player: Pubkey,
        first_player_class: RaiderClass,
        bump: u8,
    ) -> Result<()> {
        require_keys_neq!(
            first_player,
            Pubkey::default(),
            SettlementError::InvalidPlayerWallet
        );

        self.raid_id = raid_id;
        self.authority = authority;
        self.lifecycle = RaidLifecycle::Active;
        self.boss_hp = RAID_BOSS_MAX_HP;
        self.boss_max_hp = RAID_BOSS_MAX_HP;
        self.player_count = 0;
        self.elapsed_seconds = 0;
        self.strategy = RaidStrategy::AreaDenial;
        self.contribution_damage = [0; MAX_PLAYERS];
        self.player_wallets = [Pubkey::default(); MAX_PLAYERS];
        self.player_classes = [RaiderClass::Warrior; MAX_PLAYERS];
        self.bump = bump;
        self.add_player(first_player, first_player_class)?;
        Ok(())
    }

    pub fn add_player(&mut self, player: Pubkey, player_class: RaiderClass) -> Result<()> {
        require!(
            self.lifecycle == RaidLifecycle::Active,
            SettlementError::RaidNotActive
        );
        require!(!self.combat_started(), SettlementError::RaidAlreadyStarted);
        require!(
            (self.player_count as usize) < MAX_PLAYERS,
            SettlementError::RaidRosterFull
        );
        require_keys_neq!(
            player,
            Pubkey::default(),
            SettlementError::InvalidPlayerWallet
        );
        require!(
            !self
                .player_wallets
                .iter()
                .take(self.player_count as usize)
                .any(|registered| *registered == player),
            SettlementError::DuplicatePlayerWallet
        );

        let index = self.player_count as usize;
        self.player_wallets[index] = player;
        self.player_classes[index] = player_class;
        self.player_count = self
            .player_count
            .checked_add(1)
            .ok_or_else(|| error!(SettlementError::InvalidPlayerCount))?;

        Ok(())
    }

    pub fn apply_player_hit(
        &mut self,
        player_index: u8,
        damage: u16,
        elapsed_delta_seconds: u16,
    ) -> Result<()> {
        require!(
            self.lifecycle == RaidLifecycle::Active,
            SettlementError::RaidNotActive
        );
        require!(
            player_index < self.player_count,
            SettlementError::InvalidPlayerIndex
        );
        require!(damage <= MAX_HIT_DAMAGE, SettlementError::InvalidHitDamage);

        let actual_damage = damage.min(self.boss_hp);
        let contribution = self
            .contribution_damage
            .get_mut(player_index as usize)
            .ok_or_else(|| error!(SettlementError::InvalidPlayerIndex))?;

        *contribution = contribution
            .checked_add(actual_damage)
            .ok_or_else(|| error!(SettlementError::ContributionOverflow))?;

        self.boss_hp = self
            .boss_hp
            .checked_sub(actual_damage)
            .ok_or_else(|| error!(SettlementError::BossHpUnderflow))?;

        self.advance_elapsed(elapsed_delta_seconds)?;

        if self.boss_hp == 0 {
            self.lifecycle = RaidLifecycle::Victory;
        } else if self.elapsed_seconds >= RAID_DURATION_SECONDS {
            self.lifecycle = RaidLifecycle::Timeout;
        }

        Ok(())
    }

    pub fn finalize(&mut self, result: RaidResult, elapsed_delta_seconds: u16) -> Result<()> {
        require!(
            self.lifecycle == RaidLifecycle::Active,
            SettlementError::RaidNotActive
        );

        self.advance_elapsed(elapsed_delta_seconds)?;

        self.lifecycle = match result {
            RaidResult::Victory => {
                require!(self.boss_hp == 0, SettlementError::InvalidTerminalStatus);
                RaidLifecycle::Victory
            }
            RaidResult::Defeat => {
                require!(self.boss_hp > 0, SettlementError::InvalidTerminalStatus);
                RaidLifecycle::Defeat
            }
            RaidResult::Timeout => {
                require!(
                    self.elapsed_seconds >= RAID_DURATION_SECONDS,
                    SettlementError::InvalidDuration
                );
                RaidLifecycle::Timeout
            }
        };

        Ok(())
    }

    fn advance_elapsed(&mut self, elapsed_delta_seconds: u16) -> Result<()> {
        let elapsed_seconds = self
            .elapsed_seconds
            .checked_add(elapsed_delta_seconds)
            .ok_or_else(|| error!(SettlementError::RaidTimerOverflow))?;

        self.elapsed_seconds = elapsed_seconds.min(RAID_DURATION_SECONDS);
        Ok(())
    }

    fn combat_started(&self) -> bool {
        self.boss_hp < self.boss_max_hp
            || self.elapsed_seconds > 0
            || self
                .contribution_damage
                .iter()
                .take(self.player_count as usize)
                .any(|damage| *damage > 0)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaidLifecycle {
    Active,
    Victory,
    Timeout,
    Defeat,
}

impl RaidLifecycle {
    pub fn is_terminal(self) -> bool {
        !matches!(self, RaidLifecycle::Active)
    }

    pub fn as_result(self) -> Option<RaidResult> {
        match self {
            RaidLifecycle::Active => None,
            RaidLifecycle::Victory => Some(RaidResult::Victory),
            RaidLifecycle::Timeout => Some(RaidResult::Timeout),
            RaidLifecycle::Defeat => Some(RaidResult::Defeat),
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaidStrategy {
    AreaDenial,
    LeapToRanged,
    MagicResistance,
    FocusHealer,
    MeleeRetaliation,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaiderClass {
    Warrior,
    Ranger,
    Mage,
}

#[account]
#[derive(Debug)]
pub struct SettlementRecord {
    pub raid_id: [u8; 16],
    pub authority: Pubkey,
    pub result: RaidResult,
    pub duration_seconds: u16,
    pub boss_final_hp: u16,
    pub player_count: u8,
    pub settled_slot: u64,
    pub settled: bool,
    pub bump: u8,
    pub contributions: Vec<ContributionScore>,
}

impl SettlementRecord {
    pub const SPACE: usize =
        8 + 16 + 32 + 1 + 2 + 2 + 1 + 8 + 1 + 1 + 4 + (MAX_PLAYERS * ContributionScore::SIZE);

    pub fn settle_from_raid_state(
        &mut self,
        raid_state: &RaidState,
        signer: Pubkey,
        result: RaidResult,
        duration_seconds: u16,
        boss_final_hp: u16,
        contributions: Vec<ContributionScore>,
        settled_slot: u64,
        bump: u8,
    ) -> Result<()> {
        require!(!self.settled, SettlementError::DuplicateSettlement);
        require_keys_eq!(
            signer,
            raid_state.authority,
            SettlementError::InvalidAuthority
        );
        require!(
            raid_state.lifecycle.is_terminal(),
            SettlementError::RaidNotTerminal
        );
        require!(
            raid_state.lifecycle.as_result() == Some(result),
            SettlementError::SettlementResultMismatch
        );
        require!(
            duration_seconds <= RAID_DURATION_SECONDS
                && duration_seconds == raid_state.elapsed_seconds,
            SettlementError::InvalidDuration
        );
        require!(
            boss_final_hp == raid_state.boss_hp && boss_final_hp <= raid_state.boss_max_hp,
            SettlementError::InvalidBossHp
        );
        require!(
            contributions.len() == raid_state.player_count as usize
                && (1..=MAX_PLAYERS).contains(&contributions.len()),
            SettlementError::InvalidContributionCount
        );

        for (index, contribution) in contributions.iter().enumerate() {
            require!(
                contribution.player != Pubkey::default(),
                SettlementError::InvalidPlayerWallet
            );
            require_keys_eq!(
                contribution.player,
                raid_state.player_wallets[index],
                SettlementError::SettlementPlayerMismatch
            );
            require!(
                contribution.components_within_bounds()
                    && contribution.checked_total()? <= MAX_TOTAL_SCORE,
                SettlementError::InvalidContributionScore
            );
            require!(
                contribution.damage == raid_state.contribution_damage[index],
                SettlementError::InvalidContributionDamage
            );
        }

        self.raid_id = raid_state.raid_id;
        self.authority = raid_state.authority;
        self.result = result;
        self.duration_seconds = duration_seconds;
        self.boss_final_hp = boss_final_hp;
        self.player_count = raid_state.player_count;
        self.settled_slot = settled_slot;
        self.settled = true;
        self.bump = bump;
        self.contributions = contributions;

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaidResult {
    Victory,
    Defeat,
    Timeout,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ContributionScore {
    pub player: Pubkey,
    pub damage: u16,
    pub support: u16,
    pub survival: u16,
    pub objective: u16,
}

impl ContributionScore {
    pub const SIZE: usize = 32 + 2 + 2 + 2 + 2;

    pub fn checked_total(self) -> Result<u16> {
        self.damage
            .checked_add(self.support)
            .and_then(|score| score.checked_add(self.survival))
            .and_then(|score| score.checked_add(self.objective))
            .ok_or_else(|| error!(SettlementError::ScoreOverflow))
    }

    pub fn components_within_bounds(self) -> bool {
        self.damage <= MAX_SCORE_COMPONENT
            && self.support <= MAX_SCORE_COMPONENT
            && self.survival <= MAX_SCORE_COMPONENT
            && self.objective <= MAX_SCORE_COMPONENT
    }
}

#[error_code]
pub enum SettlementError {
    #[msg("Contribution score aggregation overflowed")]
    ScoreOverflow,
    #[msg("Raid player count must fit the compact RaidState account")]
    InvalidPlayerCount,
    #[msg("Player index is outside the initialized raid roster")]
    InvalidPlayerIndex,
    #[msg("Hit damage exceeds the deterministic per-hit cap")]
    InvalidHitDamage,
    #[msg("Raid state can only be updated while active")]
    RaidNotActive,
    #[msg("Raid timer overflowed")]
    RaidTimerOverflow,
    #[msg("Contribution damage overflowed")]
    ContributionOverflow,
    #[msg("Boss HP underflowed")]
    BossHpUnderflow,
    #[msg("Raid terminal status is invalid for the requested result")]
    InvalidTerminalStatus,
    #[msg("Only the RaidState authority can settle the raid")]
    InvalidAuthority,
    #[msg("Raid must be terminal before settlement")]
    RaidNotTerminal,
    #[msg("Settlement result does not match the authoritative RaidState")]
    SettlementResultMismatch,
    #[msg("Settlement duration does not match the authoritative RaidState")]
    InvalidDuration,
    #[msg("Settlement boss HP does not match the authoritative RaidState")]
    InvalidBossHp,
    #[msg("Contribution count does not match the raid player count")]
    InvalidContributionCount,
    #[msg("Contribution score components exceed settlement bounds")]
    InvalidContributionScore,
    #[msg("Contribution damage does not match the authoritative RaidState")]
    InvalidContributionDamage,
    #[msg("Settlement has already been recorded")]
    DuplicateSettlement,
    #[msg("Contribution player wallet cannot be the default pubkey")]
    InvalidPlayerWallet,
    #[msg("RaidState PDA does not match the provided raid id")]
    InvalidRaidStatePda,
    #[msg("Raid roster is full")]
    RaidRosterFull,
    #[msg("Player wallet is already registered for this raid")]
    DuplicatePlayerWallet,
    #[msg("Raid roster cannot change after combat starts")]
    RaidAlreadyStarted,
    #[msg("Settlement player wallet does not match the on-chain raid roster")]
    SettlementPlayerMismatch,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checked_total_aggregates_score_components() {
        let contribution = ContributionScore {
            player: Pubkey::new_unique(),
            damage: 1_200,
            support: 350,
            survival: 500,
            objective: 750,
        };

        assert_eq!(contribution.checked_total().unwrap(), 2_800);
    }

    #[test]
    fn checked_total_rejects_u16_overflow() {
        let contribution = ContributionScore {
            player: Pubkey::new_unique(),
            damage: u16::MAX,
            support: 1,
            survival: 0,
            objective: 0,
        };

        assert!(contribution.checked_total().is_err());
    }

    #[test]
    fn contribution_components_are_bounded() {
        let valid = ContributionScore {
            player: Pubkey::new_unique(),
            damage: MAX_SCORE_COMPONENT,
            support: 10,
            survival: 20,
            objective: 30,
        };

        let invalid = ContributionScore {
            damage: MAX_SCORE_COMPONENT + 1,
            ..valid
        };

        assert!(valid.components_within_bounds());
        assert!(!invalid.components_within_bounds());
    }

    #[test]
    fn raid_state_initializes_compact_authoritative_state() {
        let authority = Pubkey::new_unique();
        let first_player = Pubkey::new_unique();
        let mut raid_state = empty_raid_state();

        raid_state
            .initialize(
                *b"raid-demo-000001",
                authority,
                first_player,
                RaiderClass::Mage,
                255,
            )
            .unwrap();

        assert_eq!(raid_state.authority, authority);
        assert_eq!(raid_state.lifecycle, RaidLifecycle::Active);
        assert_eq!(raid_state.boss_hp, RAID_BOSS_MAX_HP);
        assert_eq!(raid_state.player_count, 1);
        assert_eq!(raid_state.player_wallets[0], first_player);
        assert_eq!(raid_state.player_classes[0], RaiderClass::Mage);
        assert_eq!(raid_state.contribution_damage, [0; MAX_PLAYERS]);
    }

    #[test]
    fn raid_state_rejects_invalid_first_player_wallet() {
        let mut raid_state = empty_raid_state();

        assert!(raid_state
            .initialize(
                *b"raid-demo-000001",
                Pubkey::new_unique(),
                Pubkey::default(),
                RaiderClass::Warrior,
                255,
            )
            .is_err());
    }

    #[test]
    fn raid_state_adds_players_to_on_chain_roster() {
        let mut raid_state = active_raid_state(1);
        let second_player = Pubkey::new_unique();

        raid_state
            .add_player(second_player, RaiderClass::Ranger)
            .unwrap();

        assert_eq!(raid_state.player_count, 2);
        assert_eq!(raid_state.player_wallets[1], second_player);
        assert_eq!(raid_state.player_classes[1], RaiderClass::Ranger);
    }

    #[test]
    fn raid_state_rejects_duplicate_or_late_roster_changes() {
        let mut raid_state = active_raid_state(2);
        let duplicate = raid_state.player_wallets[0];

        assert!(raid_state.add_player(duplicate, RaiderClass::Mage).is_err());

        raid_state.apply_player_hit(0, 10, 1).unwrap();

        assert!(raid_state
            .add_player(Pubkey::new_unique(), RaiderClass::Mage)
            .is_err());
    }

    #[test]
    fn raid_state_hit_reduces_boss_hp_and_tracks_contribution() {
        let mut raid_state = active_raid_state(4);

        raid_state.apply_player_hit(2, 125, 7).unwrap();

        assert_eq!(raid_state.boss_hp, RAID_BOSS_MAX_HP - 125);
        assert_eq!(raid_state.contribution_damage[2], 125);
        assert_eq!(raid_state.elapsed_seconds, 7);
        assert_eq!(raid_state.lifecycle, RaidLifecycle::Active);
    }

    #[test]
    fn raid_state_rejects_client_supplied_oversized_hit() {
        let mut raid_state = active_raid_state(4);

        assert!(raid_state
            .apply_player_hit(1, MAX_HIT_DAMAGE + 1, 1)
            .is_err());
        assert_eq!(raid_state.boss_hp, RAID_BOSS_MAX_HP);
        assert_eq!(raid_state.contribution_damage[1], 0);
    }

    #[test]
    fn raid_state_clamps_final_hit_and_locks_terminal_state() {
        let mut raid_state = active_raid_state(4);
        raid_state.boss_hp = 80;

        raid_state.apply_player_hit(0, 125, 3).unwrap();

        assert_eq!(raid_state.boss_hp, 0);
        assert_eq!(raid_state.contribution_damage[0], 80);
        assert_eq!(raid_state.lifecycle, RaidLifecycle::Victory);
        assert!(raid_state.apply_player_hit(0, 1, 1).is_err());
    }

    #[test]
    fn raid_state_can_finalize_defeat_from_authority_path() {
        let mut raid_state = active_raid_state(2);

        raid_state.finalize(RaidResult::Defeat, 42).unwrap();

        assert_eq!(raid_state.lifecycle, RaidLifecycle::Defeat);
        assert_eq!(raid_state.elapsed_seconds, 42);
        assert!(raid_state.finalize(RaidResult::Timeout, 1).is_err());
    }

    #[test]
    fn raid_state_rejects_early_timeout_finalize() {
        let mut raid_state = active_raid_state(2);

        assert!(raid_state.finalize(RaidResult::Timeout, 10).is_err());
        assert_eq!(raid_state.lifecycle, RaidLifecycle::Active);
    }

    #[test]
    fn settlement_records_terminal_raid_summary() {
        let mut raid_state = active_raid_state(2);
        raid_state.apply_player_hit(0, 100, 7).unwrap();
        raid_state.finalize(RaidResult::Defeat, 35).unwrap();
        let mut settlement = empty_settlement_record();
        let contributions = vec![
            contribution_score(
                raid_state.player_wallets[0],
                raid_state.contribution_damage[0],
                500,
            ),
            contribution_score(
                raid_state.player_wallets[1],
                raid_state.contribution_damage[1],
                400,
            ),
        ];

        settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Defeat,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                contributions.clone(),
                123,
                254,
            )
            .unwrap();

        assert!(settlement.settled);
        assert_eq!(settlement.raid_id, raid_state.raid_id);
        assert_eq!(settlement.result, RaidResult::Defeat);
        assert_eq!(settlement.duration_seconds, 42);
        assert_eq!(settlement.player_count, 2);
        assert_eq!(settlement.contributions, contributions);
    }

    #[test]
    fn settlement_rejects_invalid_signer() {
        let raid_state = terminal_raid_state(2);
        let mut settlement = empty_settlement_record();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                Pubkey::new_unique(),
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                settlement_contributions_for(&raid_state),
                123,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_duplicate_settlement() {
        let raid_state = terminal_raid_state(2);
        let mut settlement = empty_settlement_record();
        let contributions = settlement_contributions_for(&raid_state);

        settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                contributions.clone(),
                123,
                254,
            )
            .unwrap();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                contributions,
                124,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_invalid_player_count() {
        let raid_state = terminal_raid_state(2);
        let mut settlement = empty_settlement_record();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                vec![contribution_score(
                    raid_state.player_wallets[0],
                    raid_state.contribution_damage[0],
                    200,
                )],
                123,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_invalid_score_bounds() {
        let raid_state = terminal_raid_state(2);
        let mut settlement = empty_settlement_record();
        let mut invalid_score = contribution_score(
            raid_state.player_wallets[0],
            raid_state.contribution_damage[0],
            200,
        );
        invalid_score.damage = MAX_SCORE_COMPONENT + 1;

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                vec![
                    invalid_score,
                    contribution_score(
                        raid_state.player_wallets[1],
                        raid_state.contribution_damage[1],
                        300,
                    ),
                ],
                123,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_non_terminal_raid_status() {
        let raid_state = active_raid_state(2);
        let mut settlement = empty_settlement_record();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                settlement_contributions_for(&raid_state),
                123,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_damage_that_does_not_match_raid_state() {
        let mut raid_state = active_raid_state(2);
        raid_state.apply_player_hit(0, 80, 10).unwrap();
        raid_state.finalize(RaidResult::Defeat, 5).unwrap();
        let mut settlement = empty_settlement_record();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Defeat,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                vec![
                    contribution_score(raid_state.player_wallets[0], 79, 200),
                    contribution_score(
                        raid_state.player_wallets[1],
                        raid_state.contribution_damage[1],
                        300,
                    ),
                ],
                123,
                254,
            )
            .is_err());
    }

    #[test]
    fn settlement_rejects_player_wallet_that_does_not_match_roster() {
        let raid_state = terminal_raid_state(2);
        let mut settlement = empty_settlement_record();
        let mut contributions = settlement_contributions_for(&raid_state);
        contributions[1].player = Pubkey::new_unique();

        assert!(settlement
            .settle_from_raid_state(
                &raid_state,
                raid_state.authority,
                RaidResult::Timeout,
                raid_state.elapsed_seconds,
                raid_state.boss_hp,
                contributions,
                123,
                254,
            )
            .is_err());
    }

    fn active_raid_state(player_count: u8) -> RaidState {
        assert!((1..=MAX_PLAYERS as u8).contains(&player_count));
        let mut raid_state = empty_raid_state();
        raid_state
            .initialize(
                *b"raid-demo-000001",
                Pubkey::new_unique(),
                Pubkey::new_unique(),
                RaiderClass::Warrior,
                255,
            )
            .unwrap();

        for index in 1..player_count {
            let player_class = match index % 3 {
                0 => RaiderClass::Warrior,
                1 => RaiderClass::Ranger,
                _ => RaiderClass::Mage,
            };
            raid_state
                .add_player(Pubkey::new_unique(), player_class)
                .unwrap();
        }

        raid_state
    }

    fn empty_raid_state() -> RaidState {
        RaidState {
            raid_id: [0; 16],
            authority: Pubkey::default(),
            lifecycle: RaidLifecycle::Active,
            boss_hp: 0,
            boss_max_hp: 0,
            player_count: 0,
            elapsed_seconds: 0,
            strategy: RaidStrategy::AreaDenial,
            contribution_damage: [0; MAX_PLAYERS],
            player_wallets: [Pubkey::default(); MAX_PLAYERS],
            player_classes: [RaiderClass::Warrior; MAX_PLAYERS],
            bump: 0,
        }
    }

    fn terminal_raid_state(player_count: u8) -> RaidState {
        let mut raid_state = active_raid_state(player_count);
        raid_state
            .finalize(RaidResult::Timeout, RAID_DURATION_SECONDS)
            .unwrap();
        raid_state
    }

    fn settlement_contributions_for(raid_state: &RaidState) -> Vec<ContributionScore> {
        (0..raid_state.player_count as usize)
            .map(|index| {
                contribution_score(
                    raid_state.player_wallets[index],
                    raid_state.contribution_damage[index],
                    200 + index as u16,
                )
            })
            .collect()
    }

    fn contribution_score(player: Pubkey, damage: u16, support: u16) -> ContributionScore {
        ContributionScore {
            player,
            damage,
            support,
            survival: 500,
            objective: 750,
        }
    }

    fn empty_settlement_record() -> SettlementRecord {
        SettlementRecord {
            raid_id: [0; 16],
            authority: Pubkey::default(),
            result: RaidResult::Timeout,
            duration_seconds: 0,
            boss_final_hp: 0,
            player_count: 0,
            settled_slot: 0,
            settled: false,
            bump: 0,
            contributions: Vec::new(),
        }
    }
}
