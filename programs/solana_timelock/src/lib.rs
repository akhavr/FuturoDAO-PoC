use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};
use anchor_lang::solana_program::clock::Clock;
use anchor_lang::solana_program::system_program;

declare_id!("6YrxRS4vSZj9w2gWFCmANwpxFnHASnxphu9TuWgX2wPJ");

#[program]
pub mod solana_timelock {
    use super::*;

    // Initialize a new timelock vault for SPL tokens
    pub fn initialize_spl_lock(
        ctx: Context<InitializeSpLock>, 
        amount: u64, 
        unlock_timestamp: i64
    ) -> Result<()> {
        let timelock = &mut ctx.accounts.timelock;
        let clock = Clock::get()?;
        
        // Verify the timelock hasn't been initialized yet
        require!(!timelock.is_initialized, ErrorCode::AccountAlreadyInitialized);

        // Set timelock properties
        timelock.owner = ctx.accounts.owner.key();
        timelock.vault = ctx.accounts.vault.key();
        timelock.token_mint = ctx.accounts.token_mint.key();
        timelock.amount = amount;
        timelock.unlock_timestamp = unlock_timestamp;
        timelock.created_timestamp = clock.unix_timestamp;
        timelock.is_initialized = true;
        timelock.timelock_bump = ctx.bumps.timelock;
        timelock.vault_bump = ctx.bumps.vault;
        timelock.vault_token_bump = ctx.bumps.vault_token_account;
        
        // Initialize vault token account if needed

        // Transfer tokens to the vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.owner_token_account.to_account_info(),
                to: ctx.accounts.vault_token_account.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        );
        
        token::transfer(transfer_ctx, amount)?;
        
        Ok(())
    }

    // Initialize a new timelock vault for SOL
    pub fn initialize_sol_lock(
        ctx: Context<InitializeSolLock>,
        amount: u64,
        unlock_timestamp: i64
    ) -> Result<()> {
        let timelock = &mut ctx.accounts.timelock;
        let clock = Clock::get()?;
        
        // Set timelock properties
        timelock.owner = ctx.accounts.owner.key();
        timelock.vault = ctx.accounts.vault.key();
        timelock.token_mint = system_program::ID; // SOL uses system program ID
        timelock.amount = amount;
        timelock.unlock_timestamp = unlock_timestamp;
        timelock.created_timestamp = clock.unix_timestamp;
        timelock.is_initialized = true;
        timelock.timelock_bump = ctx.bumps.timelock;
        timelock.vault_bump = ctx.bumps.vault;
        
        // Transfer SOL to the vault
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.owner.key(),
            &ctx.accounts.vault.key(),
            amount,
        );
        
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.vault.to_account_info(),
            ],
        )?;
        
        Ok(())
    }

    // Withdraw tokens after unlock timestamp has passed
    pub fn withdraw_spl(ctx: Context<WithdrawSpl>) -> Result<()> {
        let timelock = &ctx.accounts.timelock;
        let clock = Clock::get()?;
        
        // Check if unlock time has passed
        if clock.unix_timestamp < timelock.unlock_timestamp {
            msg!("Withdrawal attempted before unlock time");
            return Err(ErrorCode::TimeNotExpired.into());
        }
        
        // Create seeds for vault PDA (not the token account)
        let vault_seeds = &[
            b"vault",
            timelock.to_account_info().key.as_ref(),
            &[timelock.vault_bump],
        ];
        
        let signer = &[&vault_seeds[..]];
        
        // Transfer tokens back to owner
        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault_token_account.to_account_info(),
                to: ctx.accounts.owner_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            },
            signer,
        );
        
        token::transfer(transfer_ctx, timelock.amount)?;
        
        Ok(())
    }

    // Withdraw SOL after unlock timestamp has passed
    pub fn withdraw_sol(ctx: Context<WithdrawSol>) -> Result<()> {
        let timelock = &ctx.accounts.timelock;
        let clock = Clock::get()?;
        
        // Check if unlock time has passed
        if clock.unix_timestamp < timelock.unlock_timestamp {
            msg!("Withdrawal attempted before unlock time");
            return Err(ErrorCode::TimeNotExpired.into());
        }
        
        // Calculate seed for PDA
        let vault_bump = timelock.vault_bump;
        let seeds = &[
            b"vault",
            timelock.to_account_info().key.as_ref(),
            &[vault_bump],
        ];
        let _ = &[&seeds[..]];
        
        // Transfer SOL back to owner using system program with PDA signature
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            ctx.accounts.vault.key,
            ctx.accounts.owner.key,
            timelock.amount,
        );
        
        anchor_lang::solana_program::program::invoke_signed(
            &transfer_ix,
            &[
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.owner.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[&[
                b"vault",
                timelock.to_account_info().key.as_ref(),
                &[vault_bump],
            ]],
        )?;
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(amount: u64, unlock_timestamp: i64)]
pub struct InitializeSpLock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    pub token_mint: Account<'info, token::Mint>,
    #[account(
        mut,
        token::mint = token_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
	init_if_needed,
        payer = owner,
        space = 8 + TimelockAccount::LEN,
        seeds = [b"timelock_spl", owner.key().as_ref()],
        bump,
        constraint = !timelock.is_initialized @ ErrorCode::AccountAlreadyInitialized
    )]
    pub timelock: Account<'info, TimelockAccount>,
    #[account(
        seeds = [b"vault", timelock.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    #[account(
	init_if_needed,
        payer = owner,
        seeds = [b"vault_token_account", timelock.key().as_ref()],
        bump,
        token::mint = token_mint,
        token::authority = vault,
        constraint = vault_token_account.amount == 0 @ ErrorCode::AccountAlreadyInitialized
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(amount: u64, unlock_timestamp: i64)]  // Add instruction parameters
pub struct InitializeSolLock<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + TimelockAccount::LEN,
        seeds = [b"timelock_sol", owner.key().as_ref()],
        bump,
        constraint = !timelock.is_initialized @ ErrorCode::AccountAlreadyInitialized,
        constraint = unlock_timestamp > Clock::get()?.unix_timestamp @ ErrorCode::TimeNotExpired
    )]
    pub timelock: Account<'info, TimelockAccount>,
    #[account(
        mut,
        seeds = [b"vault", timelock.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawSpl<'info> {
    #[account(
        mut,
        seeds = [b"timelock_spl", owner.key().as_ref()],
        bump = timelock.timelock_bump,
        constraint = timelock.owner == owner.key(),
        constraint = timelock.is_initialized == true,
        has_one = vault
    )]
    pub timelock: Account<'info, TimelockAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        token::mint = timelock.token_mint,
        token::authority = owner,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,
    #[account(
        seeds = [b"vault", timelock.key().as_ref()],
        bump = timelock.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [b"vault_token_account", timelock.key().as_ref()],
        bump = timelock.vault_token_bump,
        token::mint = timelock.token_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawSol<'info> {
    #[account(
        mut,
        seeds = [b"timelock_sol", owner.key().as_ref()],
        bump = timelock.timelock_bump,
        constraint = timelock.owner == owner.key(),
        constraint = timelock.is_initialized == true,
    )]
    pub timelock: Account<'info, TimelockAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", timelock.key().as_ref()],
        bump = timelock.vault_bump,
        constraint = timelock.vault == vault.key(),
    )]
    pub vault: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct TimelockAccount {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub unlock_timestamp: i64,
    pub created_timestamp: i64,
    pub is_initialized: bool,
    pub vault_bump: u8,
    pub vault_token_bump: u8,
    pub timelock_bump: u8,
}

impl TimelockAccount {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 1; // owner + token_mint + vault + amount + unlock + created + is_init + 3 bumps
}

#[error_code]
pub enum ErrorCode {
    #[msg("Timelock has not expired yet")]
    TimeNotExpired,
    #[msg("The account cannot be initialized because it is already being used")]
    AccountAlreadyInitialized,
}
