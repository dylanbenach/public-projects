"""Portfolio specialist agent: taxable brokerage, stock analysis, allocation, tax efficiency."""

import json
from anthropic import Anthropic
from .base import BaseAgent
from tools.financial_tools import allocation_analysis, tax_lot_analysis, compound_growth

SYSTEM = """You are a taxable brokerage and investment portfolio specialist. Use the
calculation tools to run exact allocation analysis and tax lot reviews before giving
advice. When discussing specific stocks or ETFs on the watchlist, evaluate them in the
context of the overall portfolio — position sizing, diversification, and tax impact.
Give specific buy/sell recommendations with dollar amounts. Note long-term vs. short-term
capital gains implications when relevant."""

TOOLS = [
    {
        "name": "allocation_analysis",
        "description": "Compare current portfolio allocation to target allocation. Flags asset classes that have drifted more than 3% and calculates rebalancing trades needed.",
        "input_schema": {
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "description": "List of holdings with ticker, shares, current_price, asset_class",
                    "items": {"type": "object"},
                },
                "target_allocation": {
                    "type": "object",
                    "description": "Dict of asset_class -> target fraction (e.g. {\"us_equity\": 0.60})",
                },
            },
            "required": ["holdings", "target_allocation"],
        },
    },
    {
        "name": "tax_lot_analysis",
        "description": "Calculate unrealized gains and losses per holding. Identifies tax-loss harvesting candidates (unrealized loss > $500).",
        "input_schema": {
            "type": "object",
            "properties": {
                "holdings": {
                    "type": "array",
                    "description": "List of holdings with ticker, shares, cost_basis_per_share, current_price",
                    "items": {"type": "object"},
                },
            },
            "required": ["holdings"],
        },
    },
    {
        "name": "compound_growth",
        "description": "Project the future value of an investment position.",
        "input_schema": {
            "type": "object",
            "properties": {
                "principal": {"type": "number"},
                "annual_rate": {"type": "number"},
                "years": {"type": "number"},
                "annual_contribution": {"type": "number", "default": 0},
            },
            "required": ["principal", "annual_rate", "years"],
        },
    },
]

HANDLERS = {
    "allocation_analysis": allocation_analysis,
    "tax_lot_analysis": tax_lot_analysis,
    "compound_growth": compound_growth,
}


class PortfolioAgent(BaseAgent):
    def analyze(self, question: str, data: dict) -> str:
        portfolio_data = data.get("portfolio", {})
        profile = data.get("profile", {})

        # Flatten all holdings across accounts for tool use
        all_holdings = []
        for acct in portfolio_data.get("accounts", []):
            all_holdings.extend(acct.get("holdings", []))
        enriched = dict(portfolio_data)
        enriched["all_holdings_flat"] = all_holdings

        user_message = (
            f"Question: {question}\n\n"
            f"Profile:\n{json.dumps(profile, indent=2)}\n\n"
            f"Portfolio Data:\n{json.dumps(enriched, indent=2)}"
        )
        return self._run_agentic_loop(SYSTEM, user_message, TOOLS, HANDLERS)
