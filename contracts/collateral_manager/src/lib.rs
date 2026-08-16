#![no_std]

//! # NeXora — Contract B: Collateral Manager
//!
//! Owns all risk logic: collateral deposits, loan approval, interest accrual,
//! health checks, and (Phase 3) liquidations. It never holds lender USDC — it
//! always talks to Contract A (the Pool) to release/receive funds, and reads
//! the live XLM price from a Reflector (SEP-40) oracle.
//!
//! ## Money flow
//! - Collateral (XLM) is held **here**: `deposit_collateral` pulls it in,
//!   `withdraw_collateral` / `liquidate` send it out.
//! - Loan principal (USDC) lives in the **Pool**: `borrow` asks the pool to
//!   `release_funds`, `repay` forwards USDC to the pool and books it via
//!   `receive_repayment(principal, interest)`.
//!
//! ## Key math (see specification.md §4)
//! ```text
//! collateral_value_usdc = collateral_xlm * xlm_price
//! collateral_ratio      = collateral_value_usdc / (principal + interest)
//!
//! MIN_COLLATERAL_RATIO = 150%   (can't borrow below this)
//! LIQUIDATION_THRESHOLD = 120%  (below this -> liquidatable)
//! ```

use soroban_sdk::{
    contract, contractclient, contracterror, contractimpl, contracttype, panic_with_error, token,
    Address, Env, Symbol,
};

/// Fixed-point scale (7 dp), shared with the Pool. `SCALE == 1.0`.
pub const SCALE: i128 = 10_000_000;
/// Basis points scale for collateral ratios. `10_000 == 100%`.
pub const BPS: i128 = 10_000;

pub const MIN_COLLATERAL_RATIO_BPS: i128 = 15_000; // 150%
pub const LIQUIDATION_THRESHOLD_BPS: i128 = 12_000; // 120%
pub const LIQUIDATION_BONUS_BPS: i128 = 1_000; // 10%

// Utilization-based interest curve (values are fractions scaled by SCALE).
pub const BASE_RATE: i128 = 200_000; // 2% APR
pub const KINK_UTIL: i128 = 8_000_000; // 80% utilization
pub const RATE_AT_KINK: i128 = 1_000_000; // 10% APR
pub const MAX_RATE: i128 = 5_000_000; // 50% APR
pub const SECONDS_PER_YEAR: u64 = 31_536_000;

/// Sentinel returned by `check_health` when a position has no debt.
pub const HEALTH_INFINITE: i128 = i128::MAX;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    NoPosition = 4,
    InsufficientCollateral = 5, // borrow/withdraw would drop ratio below minimum
    OracleUnavailable = 6,      // fail-safe: revert rather than use a stale price
    NoDebt = 7,
    NotLiquidatable = 8,
}

// --------------------------------------------------------- Reflector (SEP-40)

/// SEP-40 asset identifier. Reflector's CEX/DEX feed quotes XLM as
/// `Asset::Other(Symbol("XLM"))` against a USD base.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait PriceFeed {
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
    fn decimals(env: Env) -> u32;
}

// ------------------------------------------------------------- Pool (Contract A)

#[contractclient(name = "PoolClient")]
pub trait PoolInterface {
    fn release_funds(env: Env, amount: i128, to: Address);
    fn receive_repayment(env: Env, principal: i128, interest: i128);
    fn get_utilization(env: Env) -> i128;
}

// ------------------------------------------------------------------- Storage

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Position {
    pub collateral: i128, // XLM held as collateral (stroops)
    pub principal: i128,  // USDC borrowed (stroops)
    pub interest: i128,   // USDC interest accrued so far (stroops)
    pub last_update: u64, // ledger timestamp of last accrual
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Admin,
    Pool,
    Oracle,
    Usdc,
    Xlm,
    Position(Address),
}

const DAY_IN_LEDGERS: u32 = 17_280;
const INSTANCE_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const INSTANCE_LIFETIME_THRESHOLD: u32 = INSTANCE_BUMP_AMOUNT - DAY_IN_LEDGERS;
const PERSISTENT_BUMP_AMOUNT: u32 = 30 * DAY_IN_LEDGERS;
const PERSISTENT_LIFETIME_THRESHOLD: u32 = PERSISTENT_BUMP_AMOUNT - DAY_IN_LEDGERS;

// ------------------------------------------------------------ Pure rate math

/// Utilization-based borrow APR (fraction scaled by `SCALE`), kink at 80%.
/// `utilization` is `total_borrowed / pool_value`, also scaled by `SCALE`.
pub fn borrow_rate(utilization: i128) -> i128 {
    let util = utilization.clamp(0, SCALE);
    if util < KINK_UTIL {
        BASE_RATE + util * (RATE_AT_KINK - BASE_RATE) / KINK_UTIL
    } else {
        RATE_AT_KINK + (util - KINK_UTIL) * (MAX_RATE - RATE_AT_KINK) / (SCALE - KINK_UTIL)
    }
}

/// Simple interest owed on `principal` over `elapsed` seconds at APR `rate`
/// (fraction scaled by `SCALE`).
pub fn interest_for(principal: i128, rate: i128, elapsed: u64) -> i128 {
    if principal <= 0 || rate <= 0 || elapsed == 0 {
        return 0;
    }
    principal * rate * (elapsed as i128) / (SCALE * SECONDS_PER_YEAR as i128)
}

#[contract]
pub struct CollateralManagerContract;

#[contractimpl]
impl CollateralManagerContract {
    /// One-time setup wiring the pool, oracle and asset tokens.
    /// `xlm` is the SAC address of the native asset (collateral); `usdc` is the
    /// SEP-41 token used for loans (must match the pool's USDC).
    pub fn initialize(
        env: Env,
        admin: Address,
        pool: Address,
        oracle: Address,
        usdc: Address,
        xlm: Address,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Pool, &pool);
        env.storage().instance().set(&DataKey::Oracle, &oracle);
        env.storage().instance().set(&DataKey::Usdc, &usdc);
        env.storage().instance().set(&DataKey::Xlm, &xlm);
        Self::bump_instance(&env);
    }

    // ------------------------------------------------------------- Borrower

    /// Lock `amount` XLM as collateral.
    pub fn deposit_collateral(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        Self::xlm(&env).transfer(&from, &env.current_contract_address(), &amount);

        let mut pos = Self::accrued_position(&env, &from);
        pos.collateral += amount;
        Self::write_position(&env, &from, &pos);
        Self::bump_instance(&env);
    }

    /// Borrow `amount` USDC against locked collateral. Reverts unless the
    /// resulting collateral ratio stays at or above 150%.
    pub fn borrow(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut pos = Self::accrued_position(&env, &from);
        let price = Self::xlm_price(&env);
        let new_debt = pos.principal + pos.interest + amount;
        let ratio = Self::ratio_bps(pos.collateral, price, new_debt);
        if ratio < MIN_COLLATERAL_RATIO_BPS {
            panic_with_error!(&env, Error::InsufficientCollateral);
        }

        // Ask the pool to release USDC to the borrower.
        Self::pool(&env).release_funds(&amount, &from);

        pos.principal += amount;
        Self::write_position(&env, &from, &pos);
        Self::bump_instance(&env);
    }

    /// Repay up to the full debt. Interest is settled first, then principal.
    /// The caller must hold `amount` USDC. Returns the amount actually applied.
    pub fn repay(env: Env, from: Address, amount: i128) -> i128 {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut pos = Self::accrued_position(&env, &from);
        let total_owed = pos.principal + pos.interest;
        if total_owed == 0 {
            panic_with_error!(&env, Error::NoDebt);
        }
        let pay = amount.min(total_owed);

        let interest_paid = pay.min(pos.interest);
        let principal_paid = pay - interest_paid;

        // Forward the USDC to the pool, then book the repayment.
        let pool_addr = Self::pool_addr(&env);
        Self::usdc(&env).transfer(&from, &pool_addr, &pay);
        Self::pool(&env).receive_repayment(&principal_paid, &interest_paid);

        pos.interest -= interest_paid;
        pos.principal -= principal_paid;
        Self::write_position(&env, &from, &pos);
        Self::bump_instance(&env);
        pay
    }

    /// Withdraw `amount` XLM collateral. If any debt remains, the resulting
    /// ratio must stay at or above 150%.
    pub fn withdraw_collateral(env: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut pos = Self::accrued_position(&env, &from);
        if amount > pos.collateral {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        let remaining = pos.collateral - amount;
        let debt = pos.principal + pos.interest;
        if debt > 0 {
            let price = Self::xlm_price(&env);
            let ratio = Self::ratio_bps(remaining, price, debt);
            if ratio < MIN_COLLATERAL_RATIO_BPS {
                panic_with_error!(&env, Error::InsufficientCollateral);
            }
        }

        pos.collateral = remaining;
        Self::write_position(&env, &from, &pos);
        Self::xlm(&env).transfer(&env.current_contract_address(), &from, &amount);
        Self::bump_instance(&env);
    }

    // ------------------------------------------------------------- Liquidation

    /// Liquidate an undercollateralized position. Anyone may call this once the
    /// borrower's ratio drops below `LIQUIDATION_THRESHOLD` (120%). The
    /// liquidator repays up to `repay_amount` USDC of the borrower's debt and
    /// seizes collateral worth `repay * (1 + LIQUIDATION_BONUS)`.
    ///
    /// If the position can't cover the full bonus (a sharp price crash), the
    /// seizure is capped at the remaining collateral and the repay is reduced to
    /// match — the liquidator keeps their bonus on what they actually pay, and
    /// any shortfall is left as bad debt (see specification.md §4.8). Returns
    /// the USDC amount actually repaid.
    pub fn liquidate(env: Env, liquidator: Address, borrower: Address, repay_amount: i128) -> i128 {
        liquidator.require_auth();
        if repay_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let mut pos = Self::accrued_position(&env, &borrower);
        let debt = pos.principal + pos.interest;
        if debt <= 0 {
            panic_with_error!(&env, Error::NotLiquidatable);
        }
        let price = Self::xlm_price(&env);
        let ratio = Self::ratio_bps(pos.collateral, price, debt);
        if ratio >= LIQUIDATION_THRESHOLD_BPS {
            panic_with_error!(&env, Error::NotLiquidatable);
        }

        // Repay is capped at the outstanding debt.
        let mut repay = repay_amount.min(debt);

        // Collateral to seize, including the liquidation bonus.
        let seize_value = repay * (BPS + LIQUIDATION_BONUS_BPS) / BPS; // USDC value
        let mut seize_xlm = seize_value * SCALE / price; // XLM stroops
        if seize_xlm > pos.collateral {
            // Bad-debt path: take all collateral, recompute the repay it backs.
            seize_xlm = pos.collateral;
            let seized_value = seize_xlm * price / SCALE;
            repay = seized_value * BPS / (BPS + LIQUIDATION_BONUS_BPS);
        }
        if repay <= 0 || seize_xlm <= 0 {
            panic_with_error!(&env, Error::NotLiquidatable);
        }

        // Interest is settled before principal.
        let interest_paid = repay.min(pos.interest);
        let principal_paid = repay - interest_paid;

        // Liquidator funds the repayment into the pool; then book it.
        let pool_addr = Self::pool_addr(&env);
        Self::usdc(&env).transfer(&liquidator, &pool_addr, &repay);
        Self::pool(&env).receive_repayment(&principal_paid, &interest_paid);

        pos.interest -= interest_paid;
        pos.principal -= principal_paid;
        pos.collateral -= seize_xlm;
        Self::write_position(&env, &borrower, &pos);

        // Hand the seized collateral to the liquidator.
        Self::xlm(&env).transfer(&env.current_contract_address(), &liquidator, &seize_xlm);

        Self::bump_instance(&env);
        repay
    }

    // --------------------------------------------------------------- Views

    /// Current collateral ratio in basis points (15000 == 150%).
    /// Returns `HEALTH_INFINITE` when the position has no debt.
    /// Note: this reflects interest already written to storage; call after any
    /// state-changing op for the freshest value, or use `check_health_live`.
    pub fn check_health(env: Env, user: Address) -> i128 {
        let pos = Self::read_position(&env, &user);
        let debt = pos.principal + pos.interest;
        if debt <= 0 {
            return HEALTH_INFINITE;
        }
        let price = Self::xlm_price(&env);
        Self::ratio_bps(pos.collateral, price, debt)
    }

    /// Like `check_health`, but accrues interest up to *now* first (view only,
    /// does not persist). This is the number liquidation logic keys off.
    pub fn check_health_live(env: Env, user: Address) -> i128 {
        let pos = Self::accrue(&env, Self::read_position(&env, &user));
        let debt = pos.principal + pos.interest;
        if debt <= 0 {
            return HEALTH_INFINITE;
        }
        let price = Self::xlm_price(&env);
        Self::ratio_bps(pos.collateral, price, debt)
    }

    pub fn get_position(env: Env, user: Address) -> Position {
        Self::read_position(&env, &user)
    }

    /// XLM price in USDC, scaled by `SCALE` (7 dp).
    pub fn get_xlm_price(env: Env) -> i128 {
        Self::xlm_price(&env)
    }

    /// Current borrow APR (fraction scaled by `SCALE`), from live utilization.
    pub fn get_borrow_rate(env: Env) -> i128 {
        borrow_rate(Self::pool(&env).get_utilization())
    }

    pub fn get_admin(env: Env) -> Address {
        Self::require_get(&env, &DataKey::Admin)
    }
    pub fn get_pool(env: Env) -> Address {
        Self::pool_addr(&env)
    }
    pub fn get_oracle(env: Env) -> Address {
        Self::require_get(&env, &DataKey::Oracle)
    }

    // ----------------------------------------------------------- Internals

    /// Read a position, accrue interest up to now, and persist the accrual.
    fn accrued_position(env: &Env, user: &Address) -> Position {
        let pos = Self::accrue(env, Self::read_position(env, user));
        Self::write_position(env, user, &pos);
        pos
    }

    /// Pure accrual: add interest for the elapsed time at the live borrow rate.
    fn accrue(env: &Env, mut pos: Position) -> Position {
        let now = env.ledger().timestamp();
        if pos.principal > 0 && now > pos.last_update {
            let elapsed = now - pos.last_update;
            let rate = borrow_rate(Self::pool(env).get_utilization());
            pos.interest += interest_for(pos.principal, rate, elapsed);
        }
        pos.last_update = now;
        pos
    }

    fn ratio_bps(collateral: i128, price_scaled: i128, debt: i128) -> i128 {
        if debt <= 0 {
            return HEALTH_INFINITE;
        }
        let collateral_value = collateral * price_scaled / SCALE; // USDC stroops
        collateral_value * BPS / debt
    }

    /// XLM/USDC price from the oracle, normalized to `SCALE`. Fail-safe: reverts
    /// if the feed has no price rather than using a stale/fallback value.
    fn xlm_price(env: &Env) -> i128 {
        let oracle_addr: Address = Self::require_get(env, &DataKey::Oracle);
        let oracle = OracleClient::new(env, &oracle_addr);
        let asset = Asset::Other(Symbol::new(env, "XLM"));
        let pd = oracle
            .lastprice(&asset)
            .unwrap_or_else(|| panic_with_error!(env, Error::OracleUnavailable));
        if pd.price <= 0 {
            panic_with_error!(env, Error::OracleUnavailable);
        }
        let decimals = oracle.decimals();
        pd.price * SCALE / 10i128.pow(decimals)
    }

    fn pool(env: &Env) -> PoolClient<'_> {
        PoolClient::new(env, &Self::pool_addr(env))
    }
    fn pool_addr(env: &Env) -> Address {
        Self::require_get(env, &DataKey::Pool)
    }

    fn usdc(env: &Env) -> token::TokenClient<'_> {
        token::TokenClient::new(env, &Self::require_get(env, &DataKey::Usdc))
    }
    fn xlm(env: &Env) -> token::TokenClient<'_> {
        token::TokenClient::new(env, &Self::require_get(env, &DataKey::Xlm))
    }

    fn require_get(env: &Env, key: &DataKey) -> Address {
        env.storage()
            .instance()
            .get(key)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn read_position(env: &Env, user: &Address) -> Position {
        let key = DataKey::Position(user.clone());
        env.storage()
            .persistent()
            .get(&key)
            .map(|p: Position| {
                env.storage().persistent().extend_ttl(
                    &key,
                    PERSISTENT_LIFETIME_THRESHOLD,
                    PERSISTENT_BUMP_AMOUNT,
                );
                p
            })
            .unwrap_or(Position {
                collateral: 0,
                principal: 0,
                interest: 0,
                last_update: env.ledger().timestamp(),
            })
    }

    fn write_position(env: &Env, user: &Address, pos: &Position) {
        let key = DataKey::Position(user.clone());
        if pos.collateral == 0 && pos.principal == 0 && pos.interest == 0 {
            env.storage().persistent().remove(&key);
        } else {
            env.storage().persistent().set(&key, pos);
            env.storage().persistent().extend_ttl(
                &key,
                PERSISTENT_LIFETIME_THRESHOLD,
                PERSISTENT_BUMP_AMOUNT,
            );
        }
    }

    fn bump_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_LIFETIME_THRESHOLD, INSTANCE_BUMP_AMOUNT);
    }
}

mod test;
