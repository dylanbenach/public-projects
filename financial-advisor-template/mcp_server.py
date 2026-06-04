#!/usr/bin/env python3.11
"""Financial Advisor MCP Server.

Exposes your financial data as Claude Code tools so you can ask
financial questions from any session without setup.

Registration (already done in .claude/settings.json):
  Claude Code loads this automatically on startup.

Manual test:
  python3.11 mcp_server.py
"""

import json
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

# Add project root to path so we can import financial_tools
PROJECT_DIR = Path(__file__).parent
sys.path.insert(0, str(PROJECT_DIR))

from tools.financial_tools import (
    compound_growth,
    retirement_projection,
    college_projection,
    equity_and_ltv,
    mortgage_amortization,
    allocation_analysis,
    tax_lot_analysis,
)

mcp = FastMCP("Financial Advisor")

DATA_DIR = PROJECT_DIR / "data"


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def _load(name: str) -> dict:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        raw = json.load(f)
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def _fmt(amount: float) -> str:
    return f"${amount:,.2f}"


def _fmt0(amount: float) -> str:
    return f"${amount:,.0f}"


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------

@mcp.tool()
def get_net_worth() -> str:
    """Calculate current household net worth from all data files.
    Returns a breakdown of assets and liabilities with a net worth total."""
    a = _load("accounts")
    r = _load("retirement")
    re = _load("real_estate")
    c = _load("college")
    p = _load("profile")

    assets = {}
    liabilities = {}

    # Cash
    checking = sum(x.get("balance", 0) for x in a.get("checking", []))
    savings = sum(x.get("balance", 0) for x in a.get("savings", []))
    assets["Checking accounts"] = checking
    assets["Savings accounts"] = savings

    # Retirement
    all_ret = r.get("accounts", []) + r.get("spouse_accounts", [])
    for acct in all_ret:
        label = f"{acct.get('plan_name', acct.get('type','401k'))} ({acct.get('owner','self')})"
        assets[label] = acct.get("balance", 0)

    # Real estate
    for prop in re.get("properties", []):
        assets[prop.get("nickname", "Property")] = prop.get("current_estimated_value", 0)
        mtg = prop.get("mortgage", {})
        if mtg.get("current_balance"):
            liabilities[f"Mortgage ({mtg.get('lender','')})"] = mtg["current_balance"]
        heloc = prop.get("heloc", {})
        if heloc.get("balance_jan1_2025"):
            liabilities[f"HELOC ({heloc.get('lender','')})"] = heloc["balance_jan1_2025"]

    # 529
    for child in c.get("children", []):
        if child.get("529_balance"):
            assets[f"{child['name']} 529"] = child["529_balance"]

    # Portfolio
    port = _load("portfolio")
    for acct in port.get("accounts", []):
        if acct.get("total_value", 0) > 0:
            assets[f"Brokerage ({acct.get('institution','')})"] = acct["total_value"]

    # Loans & credit cards
    for loan in a.get("loans", []):
        liabilities[loan.get("nickname", "Loan")] = loan.get("current_balance", 0)
    for card in a.get("credit_cards", []):
        bal = card.get("balance", 0)
        if bal > 0 and not card.get("always_paid_in_full"):
            liabilities[card.get("nickname", "Credit Card")] = bal

    total_assets = sum(assets.values())
    total_liabilities = sum(liabilities.values())
    net_worth = total_assets - total_liabilities

    lines = ["## Net Worth Summary\n"]
    lines.append("**Assets:**")
    for label, val in assets.items():
        lines.append(f"  {label}: {_fmt0(val)}")
    lines.append(f"  **Total assets: {_fmt0(total_assets)}**\n")

    lines.append("**Liabilities:**")
    for label, val in liabilities.items():
        lines.append(f"  {label}: {_fmt0(val)}")
    lines.append(f"  **Total liabilities: {_fmt0(total_liabilities)}**\n")

    lines.append(f"**Net Worth: {_fmt0(net_worth)}**")
    return "\n".join(lines)


@mcp.tool()
def get_retirement_projection(retire_age: int = 65) -> str:
    """Project retirement savings at a given age using current account balances and contributions.

    Args:
        retire_age: Target retirement age (default 65, also try 70)
    """
    r = _load("retirement")
    p = _load("profile")

    current_age = p.get("age", 35)
    years = retire_age - current_age

    all_accounts = r.get("accounts", []) + r.get("spouse_accounts", [])

    result = retirement_projection(
        accounts=all_accounts,
        current_age=current_age,
        target_retirement_age=retire_age,
        desired_monthly_income=p.get("desired_monthly_retirement_income", 15000),
        social_security_monthly=r.get("social_security_estimate_self", 0),
        withdrawal_rate=0.04,
    )

    lines = [f"## Retirement Projection — Age {retire_age} ({years} years)\n"]
    for acct in result["account_breakdown"]:
        lines.append(f"  {acct['account']} ({acct['institution']}): {_fmt0(acct['future_value'])}")
    lines.append(f"\n**Total projected savings: {_fmt0(result['total_projected_savings'])}**")
    lines.append(f"**Sustainable monthly income (4% rule): {_fmt0(result['sustainable_monthly_withdrawal'])}/mo**")
    lines.append(f"  (All Roth — completely tax-free in retirement)")

    if years >= 30:
        # Also show maxed Roth scenario
        limit = 23500
        maxed = []
        for acct in all_accounts:
            a = dict(acct)
            if a.get("type") == "roth_401k" and a.get("owner") == "self":
                a["annual_employee_contribution"] = limit
            maxed.append(a)
        desired = p.get("desired_monthly_retirement_income", 10000)
        r_maxed = retirement_projection(maxed, current_age, retire_age, desired, 0, 0.04)
        diff = r_maxed["total_projected_savings"] - result["total_projected_savings"]
        lines.append(f"\nIf primary account holder maxes Roth 401k (${limit:,}/yr): {_fmt0(r_maxed['total_projected_savings'])} → {_fmt0(r_maxed['sustainable_monthly_withdrawal'])}/mo (+{_fmt0(diff)})")

    return "\n".join(lines)


@mcp.tool()
def get_college_gap() -> str:
    """Project each child's 529 balance vs. projected college cost and calculate the funding gap."""
    c = _load("college")
    p = _load("profile")

    current_year = 2026
    results = []

    for child in c.get("children", []):
        r = college_projection(
            child_birth_year=child.get("birth_year", 2025),
            current_year=current_year,
            current_529_balance=child.get("529_balance", 0),
            annual_contribution=child.get("annual_529_contribution", 0),
            expected_return=child.get("529_expected_annual_return", 0.065),
            target_school_type=child.get("target_school_type", "private"),
            years_of_college=child.get("years_of_college", 4),
            current_annual_costs=c.get("current_annual_costs", {}),
            cost_inflation_rate=c.get("college_cost_inflation_rate", 0.05),
        )

        hs = child.get("private_high_school", {})
        lines = [f"## {child.get('name', 'Child')} — Education Funding\n"]
        lines.append(f"**529 Plan ({child.get('529_institution', 'your state 529 plan')}):**")
        lines.append(f"  Current balance: {_fmt(child.get('529_balance', 0))}")
        lines.append(f"  Annual contributions: {_fmt0(child.get('annual_529_contribution', 0))}/yr ({child.get('contribution_breakdown', '')})")
        lines.append(f"  Projected balance at college start (2043): {_fmt0(r['projected_529_balance'])}")
        lines.append(f"  Projected private college cost (4 yrs): {_fmt0(r['projected_total_college_cost'])}")
        lines.append(f"  **Funding gap: {_fmt0(r['funding_gap'])}**")
        lines.append(f"  Extra annual contribution needed: {_fmt0(r['additional_annual_contribution_needed'])}/yr\n")

        if hs:
            lines.append(f"**Private High School (starting 2039):**")
            lines.append(f"  Today's cost: {_fmt0(hs.get('annual_cost_today', 20000))}/yr")
            lines.append(f"  Projected 2039 cost: {_fmt0(hs.get('projected_annual_cost_at_start', 37713))}/yr (~{_fmt0(hs.get('projected_annual_cost_at_start', 37713)/12)}/mo)")
            lines.append(f"  4-year total: {_fmt0(hs.get('projected_4yr_total', 162548))}")
            lines.append(f"  Funded from: cash flow / RSU vests (529 covers up to $10k/yr for K-12)\n")

        total = r['projected_total_college_cost'] + hs.get('projected_4yr_total', 0)
        lines.append(f"**Total education cost (high school + college): {_fmt0(total)}**")
        lines.append(f"Consider RSU vests, bonuses, or increased contributions to close any funding gap.")
        results.append("\n".join(lines))

    return "\n\n".join(results) if results else "No children found in college.json"


@mcp.tool()
def get_real_estate_summary() -> str:
    """Return equity, LTV, mortgage balance, and HELOC details for all properties."""
    re = _load("real_estate")

    lines = ["## Real Estate Summary\n"]
    for prop in re.get("properties", []):
        val = prop.get("current_estimated_value", 0)
        mtg = prop.get("mortgage", {})
        heloc = prop.get("heloc", {})

        mtg_bal = mtg.get("current_balance", 0)
        heloc_bal = heloc.get("balance_jan1_2025", 0)
        total_debt = mtg_bal + heloc_bal
        equity = val - total_debt

        eq = equity_and_ltv(val, total_debt)

        lines.append(f"**{prop.get('nickname', 'Property')}** — {prop.get('address', '')}")
        lines.append(f"  Estimated value:     {_fmt0(val)}")
        lines.append(f"  Equity:              {_fmt0(equity)} ({eq['equity_pct']}%)")
        lines.append(f"  Combined LTV:        {eq['ltv_pct']}%\n")
        lines.append(f"  First mortgage ({mtg.get('lender', '')}):")
        lines.append(f"    Balance: {_fmt0(mtg_bal)} @ {mtg.get('interest_rate', 0)*100:.1f}% fixed")
        lines.append(f"    Monthly payment (PITI): {_fmt0(mtg.get('monthly_payment', 0))}/mo")
        lines.append(f"    Origination: {mtg.get('start_date', '')}\n")
        if heloc:
            lines.append(f"  HELOC ({heloc.get('lender', '')}) — ⚠️ Highest-cost debt:")
            lines.append(f"    Balance: ~{_fmt0(heloc_bal)} @ {heloc.get('interest_rate', 0.08)*100:.0f}% variable")
            lines.append(f"    Monthly payment: {_fmt0(heloc.get('monthly_payment', 0))}/mo")
            lines.append(f"    Annual interest cost: ~{_fmt0(heloc_bal * heloc.get('interest_rate', 0.08))}")
            lines.append(f"    Priority: pay down aggressively — beats expected market return")

        if prop.get("annual_property_tax"):
            lines.append(f"\n  Annual property tax: {_fmt0(prop['annual_property_tax'])}")
        if prop.get("annual_insurance"):
            lines.append(f"  Annual insurance: {_fmt0(prop['annual_insurance'])}")

    return "\n".join(lines)


@mcp.tool()
def get_financial_summary() -> str:
    """Return a complete one-page financial snapshot: income, cash flow, net worth,
    retirement trajectory, and top action items."""
    p = _load("profile")
    a = _load("accounts")
    r = _load("retirement")

    checking = sum(x.get("balance", 0) for x in a.get("checking", []))
    savings = sum(x.get("balance", 0) for x in a.get("savings", []))
    total_cash = checking + savings

    all_ret = r.get("accounts", []) + r.get("spouse_accounts", [])
    total_ret = sum(x.get("balance", 0) for x in all_ret)

    monthly_income = p.get("monthly_take_home", 16400)
    monthly_expenses = p.get("monthly_expenses", 10900)
    surplus = monthly_income - monthly_expenses

    current_age = p.get("age", 40)
    target_age = p.get("target_retirement_age", 65)
    years_to_retire = max(0, target_age - current_age)
    emergency_target = p.get("emergency_fund_target", monthly_expenses * 6)
    state = p.get("state", "your state")
    action_items = p.get("action_items", [])

    lines = [
        "## Financial Snapshot\n",
        f"**Household income:** ${p.get('household_gross_income', 0):,}/yr total comp",
        f"  Primary: ${p.get('gross_income', 0):,}",
        f"  Spouse: ${p.get('spouse_gross_income', 0):,}",
        f"  Marginal rate: {p.get('federal_tax_bracket', 0.22)*100:.0f}% federal + {p.get('state_tax_rate', 0.05)*100:.1f}% {state}\n",
        f"**Monthly cash flow:**",
        f"  Take-home: ${monthly_income:,}/mo | Expenses: ${monthly_expenses:,}/mo",
        f"  Surplus: ${surplus:,}/mo\n",
        f"**Cash reserves:** ${total_cash:,.0f} (target: ${emergency_target:,.0f} for 6-month emergency fund)\n",
        f"**Retirement:** ${total_ret:,.0f} total",
        f"  At {target_age} ({years_to_retire} yrs @ 7%): see retirement projection for details\n",
    ]

    if action_items:
        lines.append("**Top action items:**")
        for i, item in enumerate(action_items, 1):
            text = item if isinstance(item, str) else item.get("text", str(item))
            lines.append(f"  {i}. {text}")

    return "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
