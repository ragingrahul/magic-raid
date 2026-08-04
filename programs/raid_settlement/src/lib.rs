use anchor_lang::prelude::*;

declare_id!("2644KGiENvPpHYbktoMUz2y6TWeQsxz8MpcRhmrakW72");

pub const MAX_PLAYERS: usize = 8;
pub const MAX_SCORE_COMPONENT: u16 = 10_000;

#[program]
pub mod raid_settlement {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        msg!("Raid settlement scaffold initialized");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

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
}
