use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::{
    anchor::{delegate, ephemeral},
    cpi::DelegateConfig,
    ephem::{FoldableIntentBuilder, MagicIntentBundleBuilder},
};

declare_id!("2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72");

pub const MAX_PLAYERS: usize = 8;
pub const MAX_SCORE_COMPONENT: u16 = 10_000;
pub const RAID_STATE_SEED: &[u8] = b"raid-state";
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
        player_count: u8,
    ) -> Result<()> {
        ctx.accounts.raid_state.initialize(
            raid_id,
            ctx.accounts.authority.key(),
            player_count,
            ctx.bumps.raid_state,
        )
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

    pub fn delegate_raid(ctx: Context<DelegateRaid>) -> Result<()> {
        ctx.accounts.delegate_pda(
            &ctx.accounts.payer,
            &[RAID_STATE_SEED],
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
pub struct InitializeRaid<'info> {
    #[account(
        init,
        payer = authority,
        space = RaidState::SPACE,
        seeds = [RAID_STATE_SEED],
        bump
    )]
    pub raid_state: Account<'info, RaidState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateRaid<'info> {
    #[account(
        mut,
        seeds = [RAID_STATE_SEED],
        bump = raid_state.bump,
        has_one = authority
    )]
    pub raid_state: Account<'info, RaidState>,
    pub authority: Signer<'info>,
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
        seeds = [RAID_STATE_SEED],
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
    pub bump: u8,
}

impl RaidState {
    pub const SPACE: usize = 8 + 16 + 32 + 1 + 2 + 2 + 1 + 2 + 1 + (MAX_PLAYERS * 2) + 1;

    pub fn initialize(
        &mut self,
        raid_id: [u8; 16],
        authority: Pubkey,
        player_count: u8,
        bump: u8,
    ) -> Result<()> {
        require!(
            (1..=MAX_PLAYERS as u8).contains(&player_count),
            SettlementError::InvalidPlayerCount
        );

        self.raid_id = raid_id;
        self.authority = authority;
        self.lifecycle = RaidLifecycle::Active;
        self.boss_hp = RAID_BOSS_MAX_HP;
        self.boss_max_hp = RAID_BOSS_MAX_HP;
        self.player_count = player_count;
        self.elapsed_seconds = 0;
        self.strategy = RaidStrategy::AreaDenial;
        self.contribution_damage = [0; MAX_PLAYERS];
        self.bump = bump;
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

        self.elapsed_seconds = self
            .elapsed_seconds
            .checked_add(elapsed_delta_seconds)
            .ok_or_else(|| error!(SettlementError::RaidTimerOverflow))?;

        if self.boss_hp == 0 {
            self.lifecycle = RaidLifecycle::Victory;
        } else if self.elapsed_seconds >= RAID_DURATION_SECONDS {
            self.lifecycle = RaidLifecycle::Timeout;
        }

        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaidLifecycle {
    Active,
    Victory,
    Timeout,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum RaidStrategy {
    AreaDenial,
    LeapToRanged,
    MagicResistance,
    FocusHealer,
    MeleeRetaliation,
}

#[account]
#[derive(Debug)]
pub struct SettlementRecord {
    pub raid_id: [u8; 16],
    pub authority: Pubkey,
    pub result: RaidResult,
    pub duration_seconds: u16,
    pub boss_final_hp: u16,
    pub settled_slot: u64,
    pub contributions: Vec<ContributionScore>,
}

impl SettlementRecord {
    pub const MAX_SIZE: usize =
        8 + 16 + 32 + 1 + 2 + 2 + 8 + 4 + (MAX_PLAYERS * ContributionScore::SIZE);
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
        let mut raid_state = empty_raid_state();

        raid_state
            .initialize(*b"raid-demo-000001", authority, 4, 255)
            .unwrap();

        assert_eq!(raid_state.authority, authority);
        assert_eq!(raid_state.lifecycle, RaidLifecycle::Active);
        assert_eq!(raid_state.boss_hp, RAID_BOSS_MAX_HP);
        assert_eq!(raid_state.player_count, 4);
        assert_eq!(raid_state.contribution_damage, [0; MAX_PLAYERS]);
    }

    #[test]
    fn raid_state_rejects_invalid_player_count() {
        let mut raid_state = empty_raid_state();

        assert!(raid_state
            .initialize(*b"raid-demo-000001", Pubkey::new_unique(), 0, 255)
            .is_err());
        assert!(raid_state
            .initialize(
                *b"raid-demo-000001",
                Pubkey::new_unique(),
                MAX_PLAYERS as u8 + 1,
                255,
            )
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

    fn active_raid_state(player_count: u8) -> RaidState {
        let mut raid_state = empty_raid_state();
        raid_state
            .initialize(
                *b"raid-demo-000001",
                Pubkey::new_unique(),
                player_count,
                255,
            )
            .unwrap();
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
            bump: 0,
        }
    }
}
