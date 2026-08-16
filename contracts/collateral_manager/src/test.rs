#![cfg(test)]

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger as _},
    token::StellarAssetClient,
    Address, Env,
};

// ------------------------------------------------------------- Mock oracle

#[contract]
pub struct MockOracle;

#[contractimpl]
impl MockOracle {
    pub fn set(env: Env, price: i128, decimals: u32) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "price"), &price);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "dec"), &decimals);
    }
    pub fn lastprice(env: Env, _asset: Asset) -> Option<PriceData> {
        let price: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "price"))
            .unwrap_or(0);
        if price == 0 {
            return None; // simulates an unavailable feed
        }
        Some(PriceData {
            price,
            timestamp: env.ledger().timestamp(),
        })
    }
    pub fn decimals(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "dec"))
            .unwrap_or(14)
    }
}

// --------------------------------------------------------------- Mock pool
//
// Stands in for Contract A. It holds real USDC (so balance assertions are
// meaningful), tracks `total_borrowed`, and computes utilization against a
// fixed notional deposit. Contract A's own share accounting is covered by the
// pool crate's tests; here we only exercise Contract B's calls into it.

#[contract]
pub struct MockPool;

#[contractimpl]
impl MockPool {
    pub fn init(env: Env, usdc: Address, deposited: i128) {
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "usdc"), &usdc);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "dep"), &deposited);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "bor"), &0i128);
    }
    pub fn release_funds(env: Env, amount: i128, to: Address) {
        let usdc: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "usdc"))
            .unwrap();
        soroban_sdk::token::TokenClient::new(&env, &usdc).transfer(
            &env.current_contract_address(),
            &to,
            &amount,
        );
        let b: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "bor"))
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "bor"), &(b + amount));
    }
    pub fn receive_repayment(env: Env, principal: i128, _interest: i128) {
        let b: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "bor"))
            .unwrap_or(0);
        let nb = if principal > b { 0 } else { b - principal };
        env.storage().instance().set(&Symbol::new(&env, "bor"), &nb);
    }
    pub fn get_utilization(env: Env) -> i128 {
        let d: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "dep"))
            .unwrap_or(0);
        if d == 0 {
            return 0;
        }
        let b: i128 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "bor"))
            .unwrap_or(0);
        b * SCALE / d
    }
    pub fn get_total_borrowed(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "bor"))
            .unwrap_or(0)
    }
}

// ------------------------------------------------------------- Test harness

const XLM: i128 = SCALE; // 1 XLM in stroops
const USDC: i128 = SCALE; // 1 USDC in stroops
const ORACLE_DECIMALS: u32 = 14;
const POOL_LIQUIDITY: i128 = 1_000 * SCALE;

struct World<'a> {
    env: Env,
    cm: CollateralManagerContractClient<'a>,
    pool: MockPoolClient<'a>,
    oracle: MockOracleClient<'a>,
    usdc: Address,
    xlm: Address,
    admin: Address,
}

fn setup<'a>() -> World<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();
    let xlm = env
        .register_stellar_asset_contract_v2(admin.clone())
        .address();

    // Mock pool, funded with USDC liquidity to lend out.
    let pool = MockPoolClient::new(&env, &env.register(MockPool, ()));
    pool.init(&usdc, &POOL_LIQUIDITY);
    StellarAssetClient::new(&env, &usdc).mint(&pool.address, &POOL_LIQUIDITY);

    // Oracle (mock). 1 XLM = 1.00 USDC by default.
    let oracle = MockOracleClient::new(&env, &env.register(MockOracle, ()));
    oracle.set(&(10i128.pow(ORACLE_DECIMALS)), &ORACLE_DECIMALS);

    // Collateral Manager (Contract B).
    let cm =
        CollateralManagerContractClient::new(&env, &env.register(CollateralManagerContract, ()));
    cm.initialize(&admin, &pool.address, &oracle.address, &usdc, &xlm);

    World {
        env,
        cm,
        pool,
        oracle,
        usdc,
        xlm,
        admin,
    }
}

fn bal(env: &Env, token: &Address, of: &Address) -> i128 {
    soroban_sdk::token::TokenClient::new(env, token).balance(of)
}

/// A borrower funded with `collateral` XLM, already deposited.
fn borrower_with_collateral(w: &World, collateral: i128) -> Address {
    let b = Address::generate(&w.env);
    StellarAssetClient::new(&w.env, &w.xlm).mint(&b, &collateral);
    w.cm.deposit_collateral(&b, &collateral);
    b
}

fn set_time(w: &World, t: u64) {
    w.env.ledger().with_mut(|li| li.timestamp = t);
}

// --------------------------------------------------------------- Pure math

#[test]
fn borrow_rate_curve() {
    assert_eq!(borrow_rate(0), BASE_RATE); // 0% util -> 2%
    assert_eq!(borrow_rate(KINK_UTIL), RATE_AT_KINK); // 80% util -> 10%
    assert_eq!(borrow_rate(SCALE), MAX_RATE); // 100% util -> 50%
                                              // 40% util -> halfway up the first leg: 2% + 0.5*(10%-2%) = 6%.
    assert_eq!(
        borrow_rate(4 * SCALE / 10),
        BASE_RATE + (RATE_AT_KINK - BASE_RATE) / 2
    );
    // 90% util -> halfway up the steep leg: 10% + 0.5*(50%-10%) = 30%.
    assert_eq!(
        borrow_rate(9 * SCALE / 10),
        RATE_AT_KINK + (MAX_RATE - RATE_AT_KINK) / 2
    );
}

// --------------------------------------------------------------- Phase 2

#[test]
fn deposit_collateral_locks_xlm() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM);
    assert_eq!(w.cm.get_position(&b).collateral, 100 * XLM);
    assert_eq!(bal(&w.env, &w.xlm, &w.cm.address), 100 * XLM);
    assert_eq!(bal(&w.env, &w.xlm, &b), 0);
}

#[test]
fn borrow_succeeds_at_exactly_150_percent() {
    let w = setup();
    let b = borrower_with_collateral(&w, 75 * XLM); // $75 collateral

    w.cm.borrow(&b, &(50 * USDC)); // 75 / 50 == 150% exactly

    assert_eq!(w.cm.get_position(&b).principal, 50 * USDC);
    assert_eq!(bal(&w.env, &w.usdc, &b), 50 * USDC); // pool released USDC
    assert_eq!(w.cm.check_health(&b), MIN_COLLATERAL_RATIO_BPS);
    assert_eq!(w.pool.get_total_borrowed(), 50 * USDC);
}

#[test]
fn borrow_below_150_percent_fails() {
    let w = setup();
    let b = borrower_with_collateral(&w, 75 * XLM);

    // 75 / 51 == ~147% < 150% -> rejected.
    let res = w.cm.try_borrow(&b, &(51 * USDC));
    assert_eq!(res, Err(Ok(Error::InsufficientCollateral.into())));
    assert_eq!(w.cm.get_position(&b).principal, 0);
    assert_eq!(bal(&w.env, &w.usdc, &b), 0);
}

#[test]
fn interest_accrues_over_time() {
    let w = setup();
    let b = borrower_with_collateral(&w, 200 * XLM);
    w.cm.borrow(&b, &(50 * USDC));

    // Utilization = 50 / 1000 = 5% -> rate = 2% + (5/80)*8% = 2.5% APR.
    let rate = borrow_rate(w.pool.get_utilization());
    assert_eq!(rate, 250_000); // 2.5% scaled by SCALE

    set_time(&w, SECONDS_PER_YEAR);
    // After one year, interest on 50 USDC = 50 * 2.5% = 1.25 USDC.
    let interest = interest_for(50 * USDC, rate, SECONDS_PER_YEAR);
    assert_eq!(interest, 125 * USDC / 100); // 1.25 USDC

    // check_health_live reflects accrued interest without persisting.
    let live = w.cm.check_health_live(&b);
    let debt = 50 * USDC + interest;
    assert_eq!(live, 200 * USDC * BPS / debt);
}

#[test]
fn full_repayment_clears_debt() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM);
    w.cm.borrow(&b, &(50 * USDC)); // borrower now holds 50 USDC

    // Repay immediately (no time elapsed -> no interest).
    let applied = w.cm.repay(&b, &(50 * USDC));
    assert_eq!(applied, 50 * USDC);

    let pos = w.cm.get_position(&b);
    assert_eq!(pos.principal, 0);
    assert_eq!(pos.interest, 0);
    assert_eq!(w.pool.get_total_borrowed(), 0);
    assert_eq!(w.cm.check_health(&b), HEALTH_INFINITE);
}

#[test]
fn partial_repayment_settles_interest_first() {
    let w = setup();
    let b = borrower_with_collateral(&w, 200 * XLM);
    w.cm.borrow(&b, &(50 * USDC));

    set_time(&w, SECONDS_PER_YEAR); // accrue 1.25 USDC interest
    let interest = interest_for(50 * USDC, 250_000, SECONDS_PER_YEAR);
    assert_eq!(interest, 125 * USDC / 100);

    // Repay 20 USDC: 1.25 clears interest, remaining 18.75 reduces principal.
    let applied = w.cm.repay(&b, &(20 * USDC));
    assert_eq!(applied, 20 * USDC);

    let pos = w.cm.get_position(&b);
    assert_eq!(pos.interest, 0);
    assert_eq!(pos.principal, 50 * USDC - (20 * USDC - interest));
    // Pool total_borrowed only drops by the principal portion.
    assert_eq!(
        w.pool.get_total_borrowed(),
        50 * USDC - (20 * USDC - interest)
    );
}

#[test]
fn withdraw_collateral_ok_when_ratio_holds() {
    let w = setup();
    let b = borrower_with_collateral(&w, 200 * XLM);
    w.cm.borrow(&b, &(50 * USDC)); // debt 50, need >=75 XLM collateral

    // Withdraw 100 XLM -> 100 left, ratio 200% >= 150% -> OK.
    w.cm.withdraw_collateral(&b, &(100 * XLM));
    assert_eq!(w.cm.get_position(&b).collateral, 100 * XLM);
    assert_eq!(bal(&w.env, &w.xlm, &b), 100 * XLM);
}

#[test]
fn withdraw_collateral_breaking_ratio_fails() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM);
    w.cm.borrow(&b, &(50 * USDC)); // need >= 75 XLM to stay at 150%

    // Withdrawing 30 would leave 70 XLM -> 140% < 150% -> rejected.
    let res = w.cm.try_withdraw_collateral(&b, &(30 * XLM));
    assert_eq!(res, Err(Ok(Error::InsufficientCollateral.into())));
    assert_eq!(w.cm.get_position(&b).collateral, 100 * XLM);
}

#[test]
fn withdraw_all_collateral_when_no_debt() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM);
    w.cm.withdraw_collateral(&b, &(100 * XLM));
    assert_eq!(w.cm.get_position(&b).collateral, 0);
    assert_eq!(bal(&w.env, &w.xlm, &b), 100 * XLM);
}

#[test]
fn oracle_price_is_normalized_to_scale() {
    let w = setup();
    // 1 XLM = 1.00 USDC at 14 decimals -> normalized to SCALE (1.0).
    assert_eq!(w.cm.get_xlm_price(), SCALE);

    // Bump to $0.50 and re-check.
    w.oracle
        .set(&(5 * 10i128.pow(ORACLE_DECIMALS) / 10), &ORACLE_DECIMALS);
    assert_eq!(w.cm.get_xlm_price(), SCALE / 2);
}

#[test]
fn oracle_unavailable_reverts_borrow() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM);
    w.oracle.set(&0, &ORACLE_DECIMALS); // feed returns None

    let res = w.cm.try_borrow(&b, &(10 * USDC));
    assert_eq!(res, Err(Ok(Error::OracleUnavailable.into())));
}

// --------------------------------------------------------------- Phase 3

/// Set the oracle XLM price, expressed in `SCALE`-scaled USDC (e.g. `SCALE/2`
/// == $0.50), converting to the oracle's raw decimals.
fn set_price_usd(w: &World, usd_scaled: i128) {
    let raw = usd_scaled * 10i128.pow(ORACLE_DECIMALS) / SCALE;
    w.oracle.set(&raw, &ORACLE_DECIMALS);
}

fn funded_liquidator(w: &World, usdc: i128) -> Address {
    let l = Address::generate(&w.env);
    StellarAssetClient::new(&w.env, &w.usdc).mint(&l, &usdc);
    l
}

fn borrower_with_loan(w: &World, collateral: i128, borrow: i128) -> Address {
    let b = borrower_with_collateral(w, collateral);
    w.cm.borrow(&b, &borrow);
    b
}

#[test]
fn liquidation_fails_when_healthy() {
    let w = setup();
    let b = borrower_with_loan(&w, 100 * XLM, 45 * USDC); // 222% at $1
    let l = funded_liquidator(&w, 50 * USDC);

    let res = w.cm.try_liquidate(&l, &b, &(10 * USDC));
    assert_eq!(res, Err(Ok(Error::NotLiquidatable.into())));
}

#[test]
fn partial_liquidation_reduces_debt_and_pays_bonus() {
    let w = setup();
    let b = borrower_with_loan(&w, 100 * XLM, 45 * USDC);
    let l = funded_liquidator(&w, 50 * USDC);

    // Price crashes to $0.50 -> collateral $50 vs debt $45 -> 111% < 120%.
    set_price_usd(&w, SCALE / 2);
    assert!(w.cm.check_health_live(&b) < LIQUIDATION_THRESHOLD_BPS);

    let repaid = w.cm.liquidate(&l, &b, &(25 * USDC));
    assert_eq!(repaid, 25 * USDC);

    // Seized = 25 * 1.10 / 0.50 = 55 XLM.
    let pos = w.cm.get_position(&b);
    assert_eq!(pos.principal, 20 * USDC); // 45 - 25
    assert_eq!(pos.collateral, 45 * XLM); // 100 - 55
    assert_eq!(bal(&w.env, &w.xlm, &l), 55 * XLM); // liquidator's bonus collateral
    assert_eq!(bal(&w.env, &w.usdc, &l), 25 * USDC); // paid 25 of 50
    assert_eq!(w.pool.get_total_borrowed(), 20 * USDC);
}

#[test]
fn full_liquidation_clears_debt() {
    let w = setup();
    let b = borrower_with_loan(&w, 100 * XLM, 45 * USDC);
    let l = funded_liquidator(&w, 50 * USDC);
    set_price_usd(&w, SCALE / 2);

    let repaid = w.cm.liquidate(&l, &b, &(45 * USDC));
    assert_eq!(repaid, 45 * USDC);

    let pos = w.cm.get_position(&b);
    assert_eq!(pos.principal, 0);
    assert_eq!(pos.interest, 0);
    // Seized = 45 * 1.10 / 0.50 = 99 XLM, 1 XLM left with the borrower.
    assert_eq!(pos.collateral, 1 * XLM);
    assert_eq!(bal(&w.env, &w.xlm, &l), 99 * XLM);
    assert_eq!(w.pool.get_total_borrowed(), 0);
}

#[test]
fn bad_debt_caps_seizure_at_collateral() {
    let w = setup();
    let b = borrower_with_loan(&w, 100 * XLM, 45 * USDC);
    let l = funded_liquidator(&w, 50 * USDC);

    // Price crashes to $0.40 -> collateral $40 < debt $45 (underwater).
    set_price_usd(&w, 4 * SCALE / 10);

    let repaid = w.cm.liquidate(&l, &b, &(45 * USDC));

    // All collateral seized; repay is what $40 of collateral backs at 10% bonus:
    // 40 * 10000/11000 = 36.3636 USDC.
    let expected_repay = (40 * USDC) * BPS / (BPS + LIQUIDATION_BONUS_BPS);
    assert_eq!(repaid, expected_repay);

    let pos = w.cm.get_position(&b);
    assert_eq!(pos.collateral, 0); // fully seized
    assert_eq!(pos.principal, 45 * USDC - expected_repay); // residual bad debt
    assert_eq!(bal(&w.env, &w.xlm, &l), 100 * XLM); // liquidator took all collateral

    // Liquidator still earned ~10%: paid `expected_repay` USDC for $40 of XLM.
    assert_eq!(bal(&w.env, &w.usdc, &l), 50 * USDC - expected_repay);
}

#[test]
fn liquidation_of_debtless_position_fails() {
    let w = setup();
    let b = borrower_with_collateral(&w, 100 * XLM); // collateral, no debt
    let l = funded_liquidator(&w, 50 * USDC);
    let res = w.cm.try_liquidate(&l, &b, &(10 * USDC));
    assert_eq!(res, Err(Ok(Error::NotLiquidatable.into())));
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn double_initialize_panics() {
    let w = setup();
    w.cm.initialize(
        &w.admin,
        &w.pool.address,
        &w.oracle.address,
        &w.usdc,
        &w.xlm,
    );
}
