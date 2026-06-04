"""Pure-Python financial calculators used as tools by the specialist agents."""

from datetime import date


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _months_between(start_str: str, end_str: str) -> int:
    start = date.fromisoformat(start_str)
    end = date.fromisoformat(end_str)
    return (end.year - start.year) * 12 + (end.month - start.month)


# ---------------------------------------------------------------------------
# Compound growth
# ---------------------------------------------------------------------------

def compound_growth(
    principal: float,
    annual_rate: float,
    years: float,
    annual_contribution: float = 0.0,
    contribution_timing: str = "end",
) -> dict:
    """
    Future value of a lump sum plus regular annual contributions.
    contribution_timing: 'end' (ordinary annuity) or 'beginning' (annuity due).
    """
    if annual_rate == 0:
        fv = principal + annual_contribution * years
    else:
        r = annual_rate
        fv_lump = principal * (1 + r) ** years
        if contribution_timing == "beginning":
            fv_annuity = annual_contribution * (((1 + r) ** years - 1) / r) * (1 + r)
        else:
            fv_annuity = annual_contribution * (((1 + r) ** years - 1) / r)
        fv = fv_lump + fv_annuity

    total_contributed = principal + annual_contribution * years
    return {
        "future_value": round(fv, 2),
        "total_contributed": round(total_contributed, 2),
        "total_growth": round(fv - total_contributed, 2),
        "years": years,
        "annual_rate": annual_rate,
    }


# ---------------------------------------------------------------------------
# Retirement projections
# ---------------------------------------------------------------------------

def retirement_projection(
    accounts: list[dict],
    current_age: int,
    target_retirement_age: int,
    desired_monthly_income: float,
    social_security_monthly: float = 0.0,
    withdrawal_rate: float = 0.04,
    salary_growth_rate: float = 0.0,
) -> dict:
    """
    Projects total retirement savings and whether it supports the desired income.
    Uses the 4% rule by default. salary_growth_rate grows contributions annually
    for active (non-frozen) accounts.
    """
    years_to_retire = target_retirement_age - current_age
    total_future_value = 0.0
    breakdown = []

    for acct in accounts:
        balance = acct.get("balance", 0)
        annual_contribution = acct.get("annual_employee_contribution", acct.get("annual_contribution", 0))
        employer_match = acct.get("annual_employer_match", 0)
        total_annual = annual_contribution + employer_match
        rate = acct.get("expected_annual_return", 0.07)
        frozen = acct.get("frozen", False)

        if salary_growth_rate > 0 and not frozen and total_annual > 0:
            # Year-by-year simulation with growing contributions
            fv = balance
            contrib = total_annual
            for _ in range(int(years_to_retire)):
                fv = fv * (1 + rate) + contrib
                contrib *= (1 + salary_growth_rate)
            future_value = round(fv, 2)
        else:
            future_value = compound_growth(balance, rate, years_to_retire, total_annual)["future_value"]

        total_future_value += future_value
        breakdown.append({
            "account": f"{acct.get('type', 'account')} ({acct.get('owner', 'self')})",
            "institution": acct.get("institution", ""),
            "future_value": future_value,
            "years": years_to_retire,
        })

    sustainable_annual_withdrawal = total_future_value * withdrawal_rate
    sustainable_monthly_withdrawal = sustainable_annual_withdrawal / 12
    monthly_income_from_investments = sustainable_monthly_withdrawal
    total_monthly_income = monthly_income_from_investments + social_security_monthly
    monthly_gap = desired_monthly_income - total_monthly_income

    return {
        "years_to_retirement": years_to_retire,
        "total_projected_savings": round(total_future_value, 2),
        "sustainable_monthly_withdrawal": round(sustainable_monthly_withdrawal, 2),
        "social_security_monthly": round(social_security_monthly, 2),
        "total_monthly_income": round(total_monthly_income, 2),
        "desired_monthly_income": round(desired_monthly_income, 2),
        "monthly_gap": round(monthly_gap, 2),
        "on_track": monthly_gap <= 0,
        "withdrawal_rate_used": withdrawal_rate,
        "account_breakdown": breakdown,
    }


def roth_conversion_analysis(
    traditional_balance: float,
    roth_balance: float,
    annual_income: float,
    conversion_amount: float,
    current_age: int,
    years_to_retirement: int,
    expected_return: float = 0.07,
    retirement_tax_rate: float = 0.22,
    current_marginal_rate: float = 0.22,
) -> dict:
    """
    Compares keeping funds in traditional vs. converting to Roth now.
    """
    tax_cost_now = conversion_amount * current_marginal_rate
    roth_growth = compound_growth(conversion_amount, expected_return, years_to_retirement)
    roth_future = roth_growth["future_value"]

    trad_growth = compound_growth(conversion_amount, expected_return, years_to_retirement)
    trad_future_after_tax = trad_growth["future_value"] * (1 - retirement_tax_rate)

    net_roth_advantage = roth_future - trad_future_after_tax - tax_cost_now

    return {
        "conversion_amount": conversion_amount,
        "tax_cost_today": round(tax_cost_now, 2),
        "roth_future_value_tax_free": round(roth_future, 2),
        "traditional_future_value_after_tax": round(trad_future_after_tax, 2),
        "net_roth_advantage": round(net_roth_advantage, 2),
        "conversion_recommended": net_roth_advantage > 0,
    }


# ---------------------------------------------------------------------------
# Mortgage / real estate
# ---------------------------------------------------------------------------

def mortgage_amortization(
    principal: float,
    annual_rate: float,
    term_years: int,
    months_paid: int = 0,
) -> dict:
    """
    Returns current balance, total interest remaining, and monthly payment.
    months_paid: how many payments have already been made.
    """
    monthly_rate = annual_rate / 12
    n = term_years * 12

    if monthly_rate == 0:
        monthly_payment = principal / n
    else:
        monthly_payment = principal * (monthly_rate * (1 + monthly_rate) ** n) / ((1 + monthly_rate) ** n - 1)

    # Fast-forward to current balance
    current_balance = principal * (1 + monthly_rate) ** months_paid - monthly_payment * (((1 + monthly_rate) ** months_paid - 1) / monthly_rate) if monthly_rate > 0 else principal - monthly_payment * months_paid

    remaining_payments = n - months_paid
    total_remaining = monthly_payment * remaining_payments
    interest_remaining = total_remaining - max(current_balance, 0)

    return {
        "monthly_payment": round(monthly_payment, 2),
        "current_balance": round(max(current_balance, 0), 2),
        "remaining_payments": remaining_payments,
        "total_interest_remaining": round(max(interest_remaining, 0), 2),
        "payoff_years_remaining": round(remaining_payments / 12, 1),
    }


def equity_and_ltv(
    current_value: float,
    mortgage_balance: float,
) -> dict:
    equity = current_value - mortgage_balance
    ltv = mortgage_balance / current_value if current_value > 0 else 0
    return {
        "current_value": round(current_value, 2),
        "mortgage_balance": round(mortgage_balance, 2),
        "equity": round(equity, 2),
        "equity_pct": round(equity / current_value * 100, 1) if current_value > 0 else 0,
        "ltv": round(ltv, 4),
        "ltv_pct": round(ltv * 100, 1),
        "pmi_required": ltv > 0.80,
    }


def rent_vs_buy(
    home_price: float,
    down_payment: float,
    mortgage_rate: float,
    term_years: int,
    monthly_rent: float,
    annual_home_appreciation: float = 0.04,
    annual_rent_increase: float = 0.03,
    annual_property_tax_rate: float = 0.012,
    annual_insurance: float = 1500.0,
    monthly_hoa: float = 0.0,
    investment_return: float = 0.07,
    analysis_years: int = 10,
) -> dict:
    """
    Compares 10-year total cost of renting vs. buying.
    Buying cost includes mortgage, tax, insurance, maintenance minus equity built.
    Renting cost includes rent plus opportunity cost of down payment.
    """
    loan = home_price - down_payment
    amort = mortgage_amortization(loan, mortgage_rate, term_years)
    monthly_payment = amort["monthly_payment"]

    # Buying total cost over analysis_years
    buying_costs = 0.0
    balance = loan
    monthly_rate = mortgage_rate / 12
    for month in range(1, analysis_years * 12 + 1):
        interest = balance * monthly_rate
        principal_paid = monthly_payment - interest
        balance -= principal_paid
        buying_costs += monthly_payment
    buying_costs += (annual_property_tax_rate * home_price + annual_insurance + monthly_hoa * 12) * analysis_years
    buying_costs += home_price * 0.01 * analysis_years  # ~1% maintenance
    future_home_value = home_price * (1 + annual_home_appreciation) ** analysis_years
    equity_at_sale = future_home_value - max(balance, 0) - future_home_value * 0.06  # 6% selling costs
    net_buying_cost = buying_costs - equity_at_sale + down_payment

    # Renting total cost
    renting_costs = 0.0
    current_rent = monthly_rent
    for year in range(analysis_years):
        renting_costs += current_rent * 12
        current_rent *= (1 + annual_rent_increase)
    down_payment_opportunity = compound_growth(down_payment, investment_return, analysis_years)
    opportunity_cost = down_payment_opportunity["total_growth"]
    net_renting_cost = renting_costs + opportunity_cost

    return {
        "analysis_years": analysis_years,
        "monthly_mortgage_payment": round(monthly_payment, 2),
        "net_buying_cost": round(net_buying_cost, 2),
        "net_renting_cost": round(net_renting_cost, 2),
        "buying_advantage": round(net_renting_cost - net_buying_cost, 2),
        "buy_recommended": net_buying_cost < net_renting_cost,
        "projected_home_value": round(future_home_value, 2),
        "projected_equity_at_sale": round(equity_at_sale, 2),
    }


# ---------------------------------------------------------------------------
# College / 529
# ---------------------------------------------------------------------------

def college_projection(
    child_birth_year: int,
    current_year: int,
    current_529_balance: float,
    annual_contribution: float,
    expected_return: float,
    target_school_type: str,
    years_of_college: int,
    current_annual_costs: dict,
    cost_inflation_rate: float = 0.05,
) -> dict:
    """
    Projects 529 balance at college start vs. projected 4-year cost.
    """
    college_start_year = child_birth_year + 18
    years_to_college = max(college_start_year - current_year, 0)

    base_annual_cost = current_annual_costs.get(target_school_type, 27000)
    projected_annual_cost = base_annual_cost * (1 + cost_inflation_rate) ** years_to_college
    projected_total_cost = sum(
        projected_annual_cost * (1 + cost_inflation_rate) ** i
        for i in range(years_of_college)
    )

    growth = compound_growth(current_529_balance, expected_return, years_to_college, annual_contribution)
    projected_529_balance = growth["future_value"]
    gap = projected_total_cost - projected_529_balance

    required_annual = 0.0
    if gap > 0 and years_to_college > 0:
        r = expected_return
        if r == 0:
            required_annual = gap / years_to_college
        else:
            required_annual = gap * r / ((1 + r) ** years_to_college - 1)

    return {
        "child_birth_year": child_birth_year,
        "years_to_college": years_to_college,
        "projected_529_balance": round(projected_529_balance, 2),
        "projected_total_college_cost": round(projected_total_cost, 2),
        "projected_annual_cost_at_start": round(projected_annual_cost, 2),
        "funding_gap": round(gap, 2),
        "fully_funded": gap <= 0,
        "additional_annual_contribution_needed": round(max(required_annual, 0), 2),
    }


# ---------------------------------------------------------------------------
# Portfolio / taxable brokerage
# ---------------------------------------------------------------------------

def allocation_analysis(holdings: list[dict], target_allocation: dict) -> dict:
    """
    Compares current portfolio allocation to target. Identifies drift and rebalancing trades.
    Each holding needs: ticker, current_price, shares, asset_class.
    """
    total_value = sum(h["shares"] * h["current_price"] for h in holdings)
    if total_value == 0:
        return {"error": "Portfolio has no value to analyze"}

    current_allocation: dict[str, float] = {}
    for h in holdings:
        asset_class = h.get("asset_class", "other")
        value = h["shares"] * h["current_price"]
        current_allocation[asset_class] = current_allocation.get(asset_class, 0) + value

    current_pct = {k: round(v / total_value, 4) for k, v in current_allocation.items()}

    drift = {}
    rebalancing_trades = []
    for asset_class, target_pct in target_allocation.items():
        current_pct_val = current_pct.get(asset_class, 0)
        drift_val = current_pct_val - target_pct
        drift[asset_class] = round(drift_val, 4)
        if abs(drift_val) >= 0.03:  # flag if >3% off target
            action = "sell" if drift_val > 0 else "buy"
            amount = abs(drift_val) * total_value
            rebalancing_trades.append({
                "asset_class": asset_class,
                "action": action,
                "amount": round(amount, 2),
                "current_pct": round(current_pct_val * 100, 1),
                "target_pct": round(target_pct * 100, 1),
            })

    return {
        "total_portfolio_value": round(total_value, 2),
        "current_allocation_pct": {k: round(v * 100, 1) for k, v in current_pct.items()},
        "target_allocation_pct": {k: round(v * 100, 1) for k, v in target_allocation.items()},
        "drift": {k: round(v * 100, 2) for k, v in drift.items()},
        "rebalancing_needed": len(rebalancing_trades) > 0,
        "rebalancing_trades": rebalancing_trades,
    }


def tax_lot_analysis(holdings: list[dict]) -> dict:
    """
    Identifies unrealized gains/losses per holding for tax planning.
    Each holding needs: ticker, shares, cost_basis_per_share, current_price.
    """
    results = []
    total_unrealized_gain = 0.0
    total_unrealized_loss = 0.0

    for h in holdings:
        shares = h["shares"]
        cost_basis = h["cost_basis_per_share"]
        current_price = h["current_price"]
        market_value = shares * current_price
        cost_value = shares * cost_basis
        unrealized = market_value - cost_value
        pct_gain = (unrealized / cost_value * 100) if cost_value > 0 else 0

        results.append({
            "ticker": h["ticker"],
            "shares": shares,
            "market_value": round(market_value, 2),
            "cost_basis_total": round(cost_value, 2),
            "unrealized_gain_loss": round(unrealized, 2),
            "pct_gain_loss": round(pct_gain, 1),
            "tax_loss_harvest_candidate": unrealized < -500,
        })

        if unrealized > 0:
            total_unrealized_gain += unrealized
        else:
            total_unrealized_loss += unrealized

    return {
        "holdings": results,
        "total_unrealized_gain": round(total_unrealized_gain, 2),
        "total_unrealized_loss": round(total_unrealized_loss, 2),
        "net_unrealized": round(total_unrealized_gain + total_unrealized_loss, 2),
        "harvest_candidates": [r for r in results if r["tax_loss_harvest_candidate"]],
    }
