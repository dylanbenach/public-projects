"""Real estate specialist agent: mortgage analysis, equity, rent-vs-buy."""

import json
from datetime import date
from anthropic import Anthropic
from .base import BaseAgent
from tools.financial_tools import mortgage_amortization, equity_and_ltv, rent_vs_buy

SYSTEM = """You are a real estate and mortgage specialist. Use the calculation tools to
ground your answers in precise numbers — quote equity percentages, LTV ratios, payoff
timelines, and break-even points. When comparing rent vs. buy, run the numbers and
clearly state which option costs less over the analysis horizon and by how much."""

TOOLS = [
    {
        "name": "mortgage_amortization",
        "description": "Calculate current mortgage balance, monthly payment, total interest remaining, and payoff timeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "principal": {"type": "number", "description": "Original loan amount"},
                "annual_rate": {"type": "number"},
                "term_years": {"type": "integer"},
                "months_paid": {"type": "integer", "default": 0, "description": "Number of payments already made"},
            },
            "required": ["principal", "annual_rate", "term_years"],
        },
    },
    {
        "name": "equity_and_ltv",
        "description": "Calculate current home equity, equity percentage, LTV ratio, and whether PMI is required.",
        "input_schema": {
            "type": "object",
            "properties": {
                "current_value": {"type": "number"},
                "mortgage_balance": {"type": "number"},
            },
            "required": ["current_value", "mortgage_balance"],
        },
    },
    {
        "name": "rent_vs_buy",
        "description": "Compare total 10-year cost of renting vs. buying, accounting for equity buildup, opportunity cost of down payment, appreciation, and selling costs.",
        "input_schema": {
            "type": "object",
            "properties": {
                "home_price": {"type": "number"},
                "down_payment": {"type": "number"},
                "mortgage_rate": {"type": "number"},
                "term_years": {"type": "integer", "default": 30},
                "monthly_rent": {"type": "number"},
                "annual_home_appreciation": {"type": "number", "default": 0.04},
                "annual_rent_increase": {"type": "number", "default": 0.03},
                "annual_property_tax_rate": {"type": "number", "default": 0.012},
                "annual_insurance": {"type": "number", "default": 1500},
                "monthly_hoa": {"type": "number", "default": 0},
                "investment_return": {"type": "number", "default": 0.07},
                "analysis_years": {"type": "integer", "default": 10},
            },
            "required": ["home_price", "down_payment", "mortgage_rate", "monthly_rent"],
        },
    },
]

HANDLERS = {
    "mortgage_amortization": mortgage_amortization,
    "equity_and_ltv": equity_and_ltv,
    "rent_vs_buy": rent_vs_buy,
}


def _months_since(date_str: str) -> int:
    start = date.fromisoformat(date_str)
    today = date.today()
    return (today.year - start.year) * 12 + (today.month - start.month)


class RealEstateAgent(BaseAgent):
    def analyze(self, question: str, data: dict) -> str:
        re_data = data.get("real_estate", {})
        profile = data.get("profile", {})

        # Pre-compute months_paid for each property so Claude doesn't have to
        enriched_properties = []
        for prop in re_data.get("properties", []):
            p = dict(prop)
            if "mortgage" in p and "start_date" in p["mortgage"]:
                p["mortgage"]["months_paid"] = _months_since(p["mortgage"]["start_date"])
            enriched_properties.append(p)
        enriched = dict(re_data)
        enriched["properties"] = enriched_properties

        user_message = (
            f"Question: {question}\n\n"
            f"Profile:\n{json.dumps(profile, indent=2)}\n\n"
            f"Real Estate Data:\n{json.dumps(enriched, indent=2)}"
        )
        return self._run_agentic_loop(SYSTEM, user_message, TOOLS, HANDLERS)
