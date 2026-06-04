"""Retirement specialist agent: 401k, IRA, Roth projections and recommendations."""

import json
from anthropic import Anthropic
from .base import BaseAgent
from tools.financial_tools import compound_growth, retirement_projection, roth_conversion_analysis

SYSTEM = """You are a retirement planning specialist. You have access to tools that run
precise financial calculations. Use them to ground your analysis in real numbers before
giving recommendations. Be specific — quote projected balances, timelines, and gaps.
When recommending contribution changes, give exact dollar amounts. Keep responses concise."""

TOOLS = [
    {
        "name": "retirement_projection",
        "description": "Project total retirement savings across all accounts and assess whether they'll support the desired monthly income using the 4% rule.",
        "input_schema": {
            "type": "object",
            "properties": {
                "accounts": {
                    "type": "array",
                    "description": "List of retirement account dicts with balance, annual_employee_contribution, annual_employer_match, expected_annual_return, type, owner fields",
                    "items": {"type": "object"}
                },
                "current_age": {"type": "integer"},
                "target_retirement_age": {"type": "integer"},
                "desired_monthly_income": {"type": "number"},
                "social_security_monthly": {"type": "number", "default": 0},
                "withdrawal_rate": {"type": "number", "default": 0.04},
            },
            "required": ["accounts", "current_age", "target_retirement_age", "desired_monthly_income"],
        },
    },
    {
        "name": "compound_growth",
        "description": "Project the future value of a single account given a balance, rate, years, and optional annual contribution.",
        "input_schema": {
            "type": "object",
            "properties": {
                "principal": {"type": "number"},
                "annual_rate": {"type": "number"},
                "years": {"type": "number"},
                "annual_contribution": {"type": "number", "default": 0},
                "contribution_timing": {"type": "string", "enum": ["end", "beginning"], "default": "end"},
            },
            "required": ["principal", "annual_rate", "years"],
        },
    },
    {
        "name": "roth_conversion_analysis",
        "description": "Analyze whether converting a traditional IRA/401k amount to Roth now is advantageous given current vs. expected retirement tax rates.",
        "input_schema": {
            "type": "object",
            "properties": {
                "traditional_balance": {"type": "number"},
                "roth_balance": {"type": "number"},
                "annual_income": {"type": "number"},
                "conversion_amount": {"type": "number"},
                "current_age": {"type": "integer"},
                "years_to_retirement": {"type": "integer"},
                "expected_return": {"type": "number", "default": 0.07},
                "retirement_tax_rate": {"type": "number", "default": 0.22},
                "current_marginal_rate": {"type": "number", "default": 0.22},
            },
            "required": ["traditional_balance", "roth_balance", "annual_income", "conversion_amount", "current_age", "years_to_retirement"],
        },
    },
]

HANDLERS = {
    "retirement_projection": retirement_projection,
    "compound_growth": compound_growth,
    "roth_conversion_analysis": roth_conversion_analysis,
}


class RetirementAgent(BaseAgent):
    def analyze(self, question: str, data: dict) -> str:
        retirement_data = data.get("retirement", {})
        profile = data.get("profile", {})
        user_message = (
            f"Question: {question}\n\n"
            f"Profile:\n{json.dumps(profile, indent=2)}\n\n"
            f"Retirement Data:\n{json.dumps(retirement_data, indent=2)}"
        )
        return self._run_agentic_loop(SYSTEM, user_message, TOOLS, HANDLERS)
