#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env,
};

const SCALE_I: i128 = SCALE;

struct Setup<'a> {
    env: Env,
    pool: PoolContractClient<'a>,
    usdc: Address,
    admin: Address,
}

fn setup<'a>() -> Setup<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let usdc = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc_addr = usdc.address();

    let pool_id = env.register(PoolContract, ());
    let pool = PoolContractClient::new(&env, &pool_id);
    pool.initialize(&admin, &usdc_addr);

    Setup {
        env,
        pool,
        usdc: usdc_addr,
        admin,
    }
}

fn mint(env: &Env, usdc: &Address, to: &Address, amount: i128) {
    StellarAssetClient::new(env, usdc).mint(to, &amount);
}

fn balance(env: &Env, usdc: &Address, of: &Address) -> i128 {
    TokenClient::new(env, usdc).balance(of)
}

fn new_lender(env: &Env, usdc: &Address, funds: i128) -> Address {
    let a = Address::generate(env);
    mint(env, usdc, &a, funds);
    a
}

// -------------------------------------------------------------------- Phase 1

#[test]
fn single_deposit_and_withdraw() {
    let s = setup();
    let lender = new_lender(&s.env, &s.usdc, 100 * SCALE_I);

    let shares = s.pool.deposit(&lender, &(100 * SCALE_I));
    assert_eq!(
        shares,
        100 * SCALE_I,
        "first depositor mints 1 share / USDC"
    );
    assert_eq!(s.pool.get_shares(&lender), 100 * SCALE_I);
    assert_eq!(s.pool.get_total_shares(), 100 * SCALE_I);
    assert_eq!(s.pool.get_available_liquidity(), 100 * SCALE_I);
    assert_eq!(s.pool.get_share_value(), SCALE_I, "share value == 1.0");
    assert_eq!(balance(&s.env, &s.usdc, &lender), 0);

    // Withdraw everything.
    let paid = s.pool.withdraw(&lender, &(100 * SCALE_I));
    assert_eq!(paid, 100 * SCALE_I);
    assert_eq!(s.pool.get_shares(&lender), 0);
    assert_eq!(s.pool.get_total_shares(), 0);
    assert_eq!(balance(&s.env, &s.usdc, &lender), 100 * SCALE_I);
}

#[test]
fn multiple_depositors_get_proportional_shares() {
    let s = setup();
    let a = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    let b = new_lender(&s.env, &s.usdc, 300 * SCALE_I);

    let sa = s.pool.deposit(&a, &(100 * SCALE_I));
    let sb = s.pool.deposit(&b, &(300 * SCALE_I));

    // Nothing changed pool value between deposits, so shares track deposits 1:3.
    assert_eq!(sa, 100 * SCALE_I);
    assert_eq!(sb, 300 * SCALE_I);
    assert_eq!(s.pool.get_total_shares(), 400 * SCALE_I);

    // Each can withdraw their exact principal (no interest yet).
    assert_eq!(s.pool.withdraw(&a, &sa), 100 * SCALE_I);
    assert_eq!(s.pool.withdraw(&b, &sb), 300 * SCALE_I);
}

#[test]
fn deposit_after_interest_mints_fewer_shares() {
    let s = setup();
    // Wire a collateral manager so we can push in simulated interest.
    let cm = Address::generate(&s.env);
    s.pool.set_collateral_manager(&cm);

    let a = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    s.pool.deposit(&a, &(100 * SCALE_I));

    // Simulate 100 USDC of interest arriving (share value 1.0 -> 2.0).
    mint(&s.env, &s.usdc, &s.pool.address, 100 * SCALE_I);
    s.pool.receive_repayment(&0, &(100 * SCALE_I));
    assert_eq!(s.pool.get_share_value(), 2 * SCALE_I);

    // New lender deposits 100 USDC but each share now costs 2 USDC.
    let b = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    let sb = s.pool.deposit(&b, &(100 * SCALE_I));
    assert_eq!(sb, 50 * SCALE_I, "100 USDC / 2.0 per share == 50 shares");
    assert!(sb < 100 * SCALE_I);
}

#[test]
fn withdraw_fails_when_liquidity_insufficient() {
    let s = setup();
    let cm = Address::generate(&s.env);
    s.pool.set_collateral_manager(&cm);

    let lender = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    s.pool.deposit(&lender, &(100 * SCALE_I));

    // 60 USDC goes out on loan; only 40 idle remains.
    let borrower = Address::generate(&s.env);
    s.pool.release_funds(&(60 * SCALE_I), &borrower);
    assert_eq!(s.pool.get_available_liquidity(), 40 * SCALE_I);
    assert_eq!(s.pool.get_total_borrowed(), 60 * SCALE_I);
    assert_eq!(balance(&s.env, &s.usdc, &borrower), 60 * SCALE_I);

    // Lender's 100 shares are worth 100 USDC but only 40 is withdrawable.
    let res = s.pool.try_withdraw(&lender, &(100 * SCALE_I));
    assert_eq!(res, Err(Ok(Error::InsufficientLiquidity.into())));

    // Withdrawing within available liquidity still works.
    let paid = s.pool.withdraw(&lender, &(40 * SCALE_I));
    assert_eq!(paid, 40 * SCALE_I);
}

#[test]
fn share_value_increases_after_repayment() {
    let s = setup();
    let cm = Address::generate(&s.env);
    s.pool.set_collateral_manager(&cm);

    let lender = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    s.pool.deposit(&lender, &(100 * SCALE_I));
    assert_eq!(s.pool.get_share_value(), SCALE_I);

    // Loan out 50, then repay 50 principal + 5 interest.
    let borrower = Address::generate(&s.env);
    s.pool.release_funds(&(50 * SCALE_I), &borrower);
    assert_eq!(
        s.pool.get_share_value(),
        SCALE_I,
        "loan alone doesn't change value"
    );

    // Contract B forwards the repayment into the pool, then books it.
    mint(&s.env, &s.usdc, &s.pool.address, 55 * SCALE_I);
    s.pool.receive_repayment(&(50 * SCALE_I), &(5 * SCALE_I));

    assert_eq!(s.pool.get_total_borrowed(), 0);
    assert_eq!(s.pool.get_pool_value(), 105 * SCALE_I);
    // 105 USDC backing 100 shares -> 1.05 per share.
    assert_eq!(s.pool.get_share_value(), SCALE_I * 105 / 100);
    assert!(s.pool.get_share_value() > SCALE_I);

    // Lender can now withdraw principal + interest.
    let paid = s.pool.withdraw(&lender, &(100 * SCALE_I));
    assert_eq!(paid, 105 * SCALE_I);
}

#[test]
fn utilization_tracks_borrowed_over_pool_value() {
    let s = setup();
    let cm = Address::generate(&s.env);
    s.pool.set_collateral_manager(&cm);

    let lender = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    s.pool.deposit(&lender, &(100 * SCALE_I));
    assert_eq!(s.pool.get_utilization(), 0);

    let borrower = Address::generate(&s.env);
    s.pool.release_funds(&(80 * SCALE_I), &borrower);
    // 80 borrowed / 100 pool value == 80%.
    assert_eq!(s.pool.get_utilization(), SCALE_I * 80 / 100);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn release_funds_requires_collateral_manager_configured() {
    let s = setup();
    let lender = new_lender(&s.env, &s.usdc, 100 * SCALE_I);
    s.pool.deposit(&lender, &(100 * SCALE_I));
    // No collateral manager set yet -> CollateralManagerNotSet (#6).
    let borrower = Address::generate(&s.env);
    s.pool.release_funds(&(10 * SCALE_I), &borrower);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn double_initialize_panics() {
    let s = setup();
    s.pool.initialize(&s.admin, &s.usdc);
}
