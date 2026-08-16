#![no_std]

//! # NeXora — Contract A: Lending Pool
//!
//! Holds all lender USDC deposits and tracks ownership via a **share system**.
//! It knows nothing about prices, collateral, or risk — that lives in Contract B
//! (Collateral Manager). Contract A only releases funds to borrowers and accepts
//! repayments when instructed by Contract B.
//!
//! ## Share accounting
//!
//! ```text
//! pool_value      = reserve_balance + total_borrowed
//! value_per_share = pool_value / total_shares          (1.0 when the pool is empty)
//!
//! deposit(amount):
//!   shares = (total_shares == 0) ? amount : amount * total_shares / pool_value
//!
//! withdraw(shares):
//!   amount_owed = shares * pool_value / total_shares
//!   require(amount_owed <= reserve_balance)            // hard revert in v1
//! ```
//!
//! ## Money-flow invariant
//!
//! `reserve_balance` always mirrors the pool contract's actual USDC token balance:
//! it increases on `deposit` / `receive_repayment` and decreases on `withdraw` /
//! `release_funds`, matching every token transfer one-to-one.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
};

/// Fixed-point scale (7 dp, matching Stellar asset precision). `SCALE == 1.0`.
pub const SCALE: i128 = 10_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InsufficientShares = 4,
    InsufficientLiquidity = 5,
    CollateralManagerNotSet = 6,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Usdc,
    CollateralManager,
    TotalShares,
    TotalBorrowed,
    Reserve,
    /// Per-lender share balance (persistent, one entry per address).
    Shares(Address),
}

const DAY_IN_LEDGERS: u32 = 17_280; // ~5s ledgers
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

#[contract]
pub struct PoolContract;

#[contractimpl]
impl PoolContract {
    /// One-time setup. `admin` can later wire the Collateral Manager address.
    /// `usdc` is the SEP-41 token contract used for all deposits/loans.
    pub fn initialize(env: Env, admin: Address, usdc: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Usdc, &usdc);
        env.storage().instance().set(&DataKey::TotalShares, &0i128);
        env.storage()
            .instance()
            .set(&DataKey::TotalBorrowed, &0i128);
        env.storage().instance().set(&DataKey::Reserve, &0i128);
        Self::bump_instance(&env);
    }

    /// Wire Contract B. Called by the admin once the Collateral Manager is
    /// deployed (Phase 2). Only this address may call `release_funds` /
    /// `receive_repayment`.
    pub fn set_collateral_manager(env: Env, collateral_manager: Address) {
        let admin: Address = Self::admin(&env);
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::CollateralManager, &collateral_manager);
        Self::bump_instance(&env);
    }

    // ---------------------------------------------------------------- Lenders

    /// Lender deposits `amount` USDC and receives newly minted shares.
    /// Returns the number of shares minted.
    pub fn deposit(env: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let total_shares = Self::total_shares(&env);
        let pool_value = Self::pool_value(&env);

        let shares_minted = if total_shares == 0 || pool_value == 0 {
            amount // first depositor: 1 share == 1 USDC
        } else {
            amount * total_shares / pool_value
        };
        if shares_minted <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        // Pull USDC from the lender into the pool.
        Self::token(&env).transfer(&from, &env.current_contract_address(), &amount);

        // Update accounting.
        Self::add_shares(&env, &from, shares_minted);
        Self::set_total_shares(&env, total_shares + shares_minted);
        Self::set_reserve(&env, Self::reserve(&env) + amount);

        Self::bump_instance(&env);
        shares_minted
    }

    /// Lender burns `shares` and receives the underlying USDC.
    /// Reverts if the pool lacks idle liquidity (v1 has no withdrawal queue).
    /// Returns the USDC amount paid out.
    pub fn withdraw(env: Env, from: Address, shares: i128) -> i128 {
        from.require_auth();
        if shares <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let owned = Self::read_shares(&env, &from);
        if shares > owned {
            panic_with_error!(&env, Error::InsufficientShares);
        }

        let total_shares = Self::total_shares(&env);
        let pool_value = Self::pool_value(&env);
        let amount_owed = shares * pool_value / total_shares;

        let reserve = Self::reserve(&env);
        if amount_owed > reserve {
            panic_with_error!(&env, Error::InsufficientLiquidity);
        }

        // Update accounting first, then transfer out.
        Self::sub_shares(&env, &from, shares);
        Self::set_total_shares(&env, total_shares - shares);
        Self::set_reserve(&env, reserve - amount_owed);
        Self::token(&env).transfer(&env.current_contract_address(), &from, &amount_owed);

        Self::bump_instance(&env);
        amount_owed
    }

    // ------------------------------------------------ Contract B (restricted)

    /// Release `amount` USDC to `to` for an approved loan. Contract B only.
    pub fn release_funds(env: Env, amount: i128, to: Address) {
        Self::require_collateral_manager(&env);
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let reserve = Self::reserve(&env);
        if amount > reserve {
            panic_with_error!(&env, Error::InsufficientLiquidity);
        }
        Self::set_reserve(&env, reserve - amount);
        Self::set_total_borrowed(&env, Self::total_borrowed(&env) + amount);
        Self::token(&env).transfer(&env.current_contract_address(), &to, &amount);
        Self::bump_instance(&env);
    }

    /// Accept a repayment. Contract B is responsible for having already
    /// transferred `principal + interest` USDC into this pool. `principal`
    /// reduces `total_borrowed`; `interest` is pure yield that lifts share
    /// value for lenders. Contract B only.
    pub fn receive_repayment(env: Env, principal: i128, interest: i128) {
        Self::require_collateral_manager(&env);
        if principal < 0 || interest < 0 || (principal == 0 && interest == 0) {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let total_borrowed = Self::total_borrowed(&env);
        // Clamp: never drive total_borrowed negative (bad-debt / rounding safety).
        let principal_applied = if principal > total_borrowed {
            total_borrowed
        } else {
            principal
        };
        Self::set_total_borrowed(&env, total_borrowed - principal_applied);
        Self::set_reserve(&env, Self::reserve(&env) + principal + interest);
        Self::bump_instance(&env);
    }

    // ------------------------------------------------------------------ Views

    /// Value of one share in USDC, scaled by `SCALE` (7 dp). 1.0 == `SCALE`.
    pub fn get_share_value(env: Env) -> i128 {
        let total_shares = Self::total_shares(&env);
        if total_shares == 0 {
            return SCALE;
        }
        Self::pool_value(&env) * SCALE / total_shares
    }

    /// Idle USDC withdrawable right now (`reserve_balance`).
    pub fn get_available_liquidity(env: Env) -> i128 {
        Self::reserve(&env)
    }

    /// Total USDC currently out on loan.
    pub fn get_total_borrowed(env: Env) -> i128 {
        Self::total_borrowed(&env)
    }

    /// Total assets under management: `reserve_balance + total_borrowed`.
    /// Contract B uses this as the utilization denominator.
    pub fn get_total_deposited(env: Env) -> i128 {
        Self::pool_value(&env)
    }

    /// Alias for total assets under management.
    pub fn get_pool_value(env: Env) -> i128 {
        Self::pool_value(&env)
    }

    /// Utilization = `total_borrowed / pool_value`, scaled by `SCALE`.
    /// Returns 0 when the pool is empty. 80% == `8 * SCALE / 10`.
    pub fn get_utilization(env: Env) -> i128 {
        let pool_value = Self::pool_value(&env);
        if pool_value == 0 {
            return 0;
        }
        Self::total_borrowed(&env) * SCALE / pool_value
    }

    pub fn get_shares(env: Env, lender: Address) -> i128 {
        Self::read_shares(&env, &lender)
    }

    pub fn get_total_shares(env: Env) -> i128 {
        Self::total_shares(&env)
    }

    pub fn get_usdc(env: Env) -> Address {
        Self::require_init(&env);
        env.storage().instance().get(&DataKey::Usdc).unwrap()
    }

    pub fn get_admin(env: Env) -> Address {
        Self::admin(&env)
    }

    /// Configured Collateral Manager, or `None` until wired in Phase 2.
    pub fn get_collateral_manager(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::CollateralManager)
    }

    // -------------------------------------------------------------- Internals

    fn pool_value(env: &Env) -> i128 {
        Self::reserve(env) + Self::total_borrowed(env)
    }

    fn require_init(env: &Env) {
        if !env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(env, Error::NotInitialized);
        }
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn require_collateral_manager(env: &Env) {
        let cm: Address = env
            .storage()
            .instance()
            .get(&DataKey::CollateralManager)
            .unwrap_or_else(|| panic_with_error!(env, Error::CollateralManagerNotSet));
        // Passes only when Contract B is in the current authorization tree.
        cm.require_auth();
    }

    fn token(env: &Env) -> token::TokenClient<'_> {
        let usdc: Address = env
            .storage()
            .instance()
            .get(&DataKey::Usdc)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized));
        token::TokenClient::new(env, &usdc)
    }

    fn total_shares(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalShares)
            .unwrap_or(0)
    }
    fn set_total_shares(env: &Env, v: i128) {
        env.storage().instance().set(&DataKey::TotalShares, &v);
    }

    fn total_borrowed(env: &Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalBorrowed)
            .unwrap_or(0)
    }
    fn set_total_borrowed(env: &Env, v: i128) {
        env.storage().instance().set(&DataKey::TotalBorrowed, &v);
    }

    fn reserve(env: &Env) -> i128 {
        env.storage().instance().get(&DataKey::Reserve).unwrap_or(0)
    }
    fn set_reserve(env: &Env, v: i128) {
        env.storage().instance().set(&DataKey::Reserve, &v);
    }

    fn read_shares(env: &Env, addr: &Address) -> i128 {
        let key = DataKey::Shares(addr.clone());
        let v: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if v != 0 {
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
        v
    }

    fn add_shares(env: &Env, addr: &Address, delta: i128) {
        let key = DataKey::Shares(addr.clone());
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(current + delta));
        env.storage().persistent().extend_ttl(
            &key,
            PERSISTENT_LIFETIME_THRESHOLD,
            PERSISTENT_BUMP_AMOUNT,
        );
    }

    fn sub_shares(env: &Env, addr: &Address, delta: i128) {
        let key = DataKey::Shares(addr.clone());
        let current: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        let next = current - delta;
        if next == 0 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, &next);
        }
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }
}

mod test;
