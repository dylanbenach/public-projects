"""Financial Advisor Dashboard — FastAPI backend.

Reads local data files and runs financial calculators.
Exposes endpoints for the React frontend.

Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import json
import sys
from pathlib import Path
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# Pull in the shared financial tools
PROJECT_DIR = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from tools.financial_tools import (
    compound_growth,
    retirement_projection,
    college_projection,
    equity_and_ltv,
    mortgage_amortization,
)

app = FastAPI(title="Financial Advisor Dashboard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = PROJECT_DIR / "data"
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def load(name: str) -> dict:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        raw = json.load(f)
    return {k: v for k, v in raw.items() if not k.startswith("_")}


def months_since(date_str: str) -> int:
    try:
        d = date.fromisoformat(date_str)
        today = date.today()
        return (today.year - d.year) * 12 + (today.month - d.month)
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Request models for what-if endpoints
# ---------------------------------------------------------------------------

class RetirementParams(BaseModel):
    retire_age: int = 70
    primary_contribution_annual: float = 0
    spouse_contribution_annual: float = 0
    expected_return: float = 0.07
    salary_growth_rate: float = 0.03


class CollegeParams(BaseModel):
    annual_contribution: float = 5500
    expected_return: float = 0.065
    school_type: str = "private"


HISTORY_FILE = DATA_DIR / "networth_history.json"


def _load_networth_history() -> list:
    if not HISTORY_FILE.exists():
        return []
    with open(HISTORY_FILE) as f:
        return json.load(f)


def _build_rsu(port: dict) -> dict:
    rsu = port.get("rsu_program", port.get("azn_rsu_program", {}))
    grants = rsu.get("grants", [])
    price = rsu.get("price_per_share")
    current_year = date.today().year
    next_vest = rsu.get("first_vest", current_year + 3)
    years_to_vest = max(next_vest - current_year, 0)
    total_unvested_shares = sum(g.get("shares", 0) for g in grants if g.get("vest_year", 9999) > current_year)
    projected_value = round(total_unvested_shares * price) if price else None
    return {
        "ticker": rsu.get("ticker", ""),
        "annual_grant_value": rsu.get("annual_grant_value", 0),
        "next_vest_year": next_vest,
        "years_to_vest": years_to_vest,
        "total_unvested_shares": total_unvested_shares,
        "price": price,
        "projected_vest_value": projected_value,
        "grants": grants,
    }


# ---------------------------------------------------------------------------
# /api/summary — full current state
# ---------------------------------------------------------------------------

@app.get("/api/summary")
def get_summary():
    p = load("profile")
    a = load("accounts")
    r = load("retirement")
    re = load("real_estate")
    c = load("college")
    port = load("portfolio")

    # ── Net worth ─────────────────────────────────────────────────
    checking = sum(x.get("balance", 0) for x in a.get("checking", []))
    savings = sum(x.get("balance", 0) for x in a.get("savings", []))

    all_ret = r.get("accounts", []) + r.get("spouse_accounts", [])
    retirement_total = sum(x.get("balance", 0) for x in all_ret)

    home_value = re.get("current_estimated_value", 0)
    mtg = re.get("mortgage", {})
    mortgage_balance = mtg.get("current_balance", 0)

    college_balance = sum(ch.get("529_balance", 0) for ch in c.get("children", []))
    brokerage = sum(acct.get("total_value", 0) for acct in port.get("accounts", []))

    car_loan = sum(l.get("current_balance", 0) for l in a.get("loans", []))
    cc_debt = sum(
        card.get("balance", 0)
        for card in a.get("credit_cards", [])
        if card.get("balance", 0) > 0 and not card.get("always_paid_in_full")
    )

    total_assets = checking + savings + retirement_total + home_value + college_balance + brokerage
    total_liabilities = mortgage_balance + car_loan + cc_debt
    net_worth = total_assets - total_liabilities

    # ── Retirement projection (current settings) ───────────────────
    current_age = p.get("age", 40)
    target_retire_age = p.get("target_retirement_age", 70)
    desired_income = p.get("desired_monthly_retirement_income", 10000)
    ret_result = retirement_projection(
        accounts=all_ret,
        current_age=current_age,
        target_retirement_age=target_retire_age,
        desired_monthly_income=desired_income,
        social_security_monthly=0,
        withdrawal_rate=0.04,
        salary_growth_rate=0.03,
    )

    # Growth curve: annual snapshots from now to target retirement age
    ret_curve = []
    for yr in range(0, target_retire_age - current_age + 1):
        snap = retirement_projection(
            accounts=all_ret,
            current_age=current_age,
            target_retirement_age=current_age + yr,
            desired_monthly_income=desired_income,
            withdrawal_rate=0.04,
            salary_growth_rate=0.03,
        )
        ret_curve.append({"age": current_age + yr, "value": snap["total_projected_savings"]})

    # ── College ────────────────────────────────────────────────────
    current_year = date.today().year
    college_data = {}
    if c.get("children"):
        child = c["children"][0]
        cr = college_projection(
            child_birth_year=child.get("birth_year", 2025),
            current_year=current_year,
            current_529_balance=child.get("529_balance", 0),
            annual_contribution=child.get("annual_529_contribution", 5500),
            expected_return=child.get("529_expected_annual_return", 0.065),
            target_school_type=child.get("target_school_type", "private"),
            years_of_college=4,
            current_annual_costs=c.get("current_annual_costs", {}),
            cost_inflation_rate=c.get("college_cost_inflation_rate", 0.05),
        )
        # 529 growth curve vs cost curve
        college_curve = []
        birth_yr = child.get("birth_year", 2025)
        for yr in range(0, 18):
            age = yr
            snap = college_projection(
                child_birth_year=birth_yr,
                current_year=current_year,
                current_529_balance=child.get("529_balance", 0),
                annual_contribution=child.get("annual_529_contribution", 5500),
                expected_return=child.get("529_expected_annual_return", 0.065),
                target_school_type=child.get("target_school_type", "private"),
                years_of_college=4,
                current_annual_costs=c.get("current_annual_costs", {}),
                cost_inflation_rate=c.get("college_cost_inflation_rate", 0.05),
            )
            balance_at = compound_growth(
                child.get("529_balance", 0),
                child.get("529_expected_annual_return", 0.065),
                yr,
                child.get("annual_529_contribution", 5500),
            )["future_value"]
            college_curve.append({
                "year": current_year + yr,
                "child_age": yr,
                "balance": round(balance_at),
            })
        college_data = {
            "child_name": child.get("name", "Child"),
            "current_balance": child.get("529_balance", 0),
            "annual_contribution": child.get("annual_529_contribution", 5500),
            "projected_balance": cr["projected_529_balance"],
            "projected_cost": cr["projected_total_college_cost"],
            "funding_gap": cr["funding_gap"],
            "fully_funded": cr["fully_funded"],
            "years_to_college": cr["years_to_college"],
            "school_type": child.get("target_school_type", "private"),
            "curve": college_curve,
        }

    # ── Debts ──────────────────────────────────────────────────────
    amort = mortgage_amortization(
        principal=mtg.get("current_balance", 0),
        annual_rate=mtg.get("interest_rate", 0.065),
        term_years=mtg.get("term_years", 30),
        months_paid=0,  # already current balance
    )
    eq = equity_and_ltv(
        current_value=home_value,
        mortgage_balance=mortgage_balance,
    )

    return {
        "net_worth": {
            "total": net_worth,
            "assets": {
                "home": home_value,
                "retirement": retirement_total,
                "cash": checking + savings,
                "college_529": college_balance,
                "brokerage": brokerage,
            },
            "liabilities": {
                "mortgage": mortgage_balance,
                "car_loan": car_loan,
            },
        },
        "cash_flow": {
            "monthly_income": p.get("monthly_take_home", 16400),
            "monthly_expenses": p.get("monthly_expenses", 10900),
            "monthly_childcare": p.get("monthly_childcare", 2400),
            "monthly_surplus": (
                p.get("monthly_take_home", 16400)
                - p.get("monthly_expenses", 10900)
                - p.get("monthly_childcare", 2400)
            ),
        },
        "retirement": {
            "total": ret_result["total_projected_savings"],
            "monthly_income": ret_result["sustainable_monthly_withdrawal"],
            "current_age": current_age,
            "target_age": target_retire_age,
            "accounts": [
                {
                    "name": a.get("plan_name", a.get("type", "")),
                    "balance": a.get("balance", 0),
                    "type": a.get("type", ""),
                    "employer": a.get("employer", ""),
                    "contribution": a.get("annual_employee_contribution", 0) + a.get("annual_employer_match", 0),
                    "roth_balance": a.get("roth_balance_within_account"),
                    "pretax_balance": a.get("pretax_balance_within_account"),
                    "allocation_notes": a.get("allocation_notes"),
                }
                for a in all_ret
            ],
            "curve": ret_curve,
        },
        "college": college_data,
        "debts": {
            "mortgage": {
                "balance": mortgage_balance,
                "rate": mtg.get("interest_rate", 0.065),
                "monthly_payment": mtg.get("monthly_payment", 0),
                "lender": mtg.get("lender", ""),
                "payoff_years": amort["payoff_years_remaining"],
            },
            "car": {
                "balance": car_loan,
                "rate": next((l.get("interest_rate", 0.05) for l in a.get("loans", [])), 0.05),
                "monthly_payment": next((l.get("monthly_payment", 800) for l in a.get("loans", [])), 800),
            },
            "home_equity": eq["equity"],
            "home_equity_pct": eq["equity_pct"],
            "ltv": eq["ltv_pct"],
        },
        "profile": {
            "name": p.get("name", ""),
            "spouse": p.get("spouse_name", ""),
            "age": current_age,
            "gross_income": p.get("gross_income", 0),
            "household_income": p.get("household_gross_income", 0),
            "federal_bracket": p.get("federal_tax_bracket", 0.22),
            "state_tax_rate": p.get("state_tax_rate", 0.05),
        },
        "action_items": p.get("action_items", []),
        "spending_categories": {
            k: v for k, v in p.get("monthly_spending_categories", {}).items()
            if not k.startswith("_")
        },
        "networth_history": _load_networth_history(),
        "rsu": _build_rsu(port),
        "watchlist": [w for w in port.get("watchlist", []) if not str(w.get("ticker", "")).startswith("_")],
        "portfolio_accounts": port.get("accounts", []),
    }


# ---------------------------------------------------------------------------
# /api/retirement — what-if recalculation
# ---------------------------------------------------------------------------

@app.post("/api/retirement")
def recalc_retirement(params: RetirementParams):
    r = load("retirement")
    p = load("profile")
    current_age = p.get("age", 35)

    all_ret = r.get("accounts", []) + r.get("spouse_accounts", [])

    desired_income = p.get("desired_monthly_retirement_income", 10000)

    # Override contribution rates with what-if values
    accounts = []
    for acct in all_ret:
        a = dict(acct)
        if a.get("owner") == "self":
            a["annual_employee_contribution"] = params.primary_contribution_annual
        elif a.get("owner") == "spouse":
            a["annual_employee_contribution"] = params.spouse_contribution_annual
        a["expected_annual_return"] = params.expected_return
        accounts.append(a)

    result = retirement_projection(
        accounts=accounts,
        current_age=current_age,
        target_retirement_age=params.retire_age,
        desired_monthly_income=desired_income,
        withdrawal_rate=0.04,
        salary_growth_rate=params.salary_growth_rate,
    )

    # Growth curve
    curve = []
    for yr in range(0, params.retire_age - current_age + 1):
        snap = retirement_projection(
            accounts=accounts,
            current_age=current_age,
            target_retirement_age=current_age + yr,
            desired_monthly_income=desired_income,
            withdrawal_rate=0.04,
            salary_growth_rate=params.salary_growth_rate,
        )
        curve.append({"age": current_age + yr, "value": snap["total_projected_savings"]})

    return {
        "total": result["total_projected_savings"],
        "monthly_income": result["sustainable_monthly_withdrawal"],
        "years_to_retirement": result["years_to_retirement"],
        "curve": curve,
    }


# ---------------------------------------------------------------------------
# /api/college — what-if recalculation
# ---------------------------------------------------------------------------

@app.post("/api/college")
def recalc_college(params: CollegeParams):
    c = load("college")
    current_year = date.today().year

    if not c.get("children"):
        return {"error": "No children in college.json"}

    child = c["children"][0]
    result = college_projection(
        child_birth_year=child.get("birth_year", 2025),
        current_year=current_year,
        current_529_balance=child.get("529_balance", 0),
        annual_contribution=params.annual_contribution,
        expected_return=params.expected_return,
        target_school_type=params.school_type,
        years_of_college=4,
        current_annual_costs=c.get("current_annual_costs", {}),
        cost_inflation_rate=c.get("college_cost_inflation_rate", 0.05),
    )

    curve = []
    for yr in range(0, 18):
        bal = compound_growth(
            child.get("529_balance", 0),
            params.expected_return,
            yr,
            params.annual_contribution,
        )["future_value"]
        curve.append({"year": current_year + yr, "child_age": yr, "balance": round(bal)})

    return {
        "projected_balance": result["projected_529_balance"],
        "projected_cost": result["projected_total_college_cost"],
        "funding_gap": result["funding_gap"],
        "fully_funded": result["fully_funded"],
        "additional_needed": result["additional_annual_contribution_needed"],
        "curve": curve,
    }


# ---------------------------------------------------------------------------
# /api/networth/snapshot — save today's net worth to history
# ---------------------------------------------------------------------------

@app.post("/api/networth/snapshot")
def save_networth_snapshot():
    summary = get_summary()
    nw = round(summary["net_worth"]["total"])
    history = _load_networth_history()
    today = date.today().isoformat()
    history = [e for e in history if e["date"] != today]
    history.append({"date": today, "net_worth": nw, "note": "Dashboard snapshot"})
    history.sort(key=lambda e: e["date"])
    with open(HISTORY_FILE, "w") as f:
        json.dump(history, f, indent=2)
    return {"date": today, "net_worth": nw}


# ---------------------------------------------------------------------------
# Serve built frontend (production)
# ---------------------------------------------------------------------------

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        return FileResponse(FRONTEND_DIR / "index.html")
