"""College planning specialist agent: 529 projections and contribution recommendations."""

import json
from datetime import date
from anthropic import Anthropic
from .base import BaseAgent
from tools.financial_tools import college_projection, compound_growth

SYSTEM = """You are a college savings specialist. Use the projection tools to calculate
exact funding gaps and required contribution increases for each child. Be specific about
dollar amounts and timelines. If a 529 is on track, say so clearly. If not, give a
concrete revised monthly or annual contribution amount. Mention tax advantages of 529s
when relevant."""

TOOLS = [
    {
        "name": "college_projection",
        "description": "Project 529 balance at college start vs. projected 4-year cost, and calculate additional annual contribution needed to close any gap.",
        "input_schema": {
            "type": "object",
            "properties": {
                "child_birth_year": {"type": "integer"},
                "current_year": {"type": "integer"},
                "current_529_balance": {"type": "number"},
                "annual_contribution": {"type": "number"},
                "expected_return": {"type": "number"},
                "target_school_type": {"type": "string", "enum": ["public_in_state", "public_out_of_state", "private"]},
                "years_of_college": {"type": "integer", "default": 4},
                "current_annual_costs": {"type": "object", "description": "Dict of school_type -> current annual cost"},
                "cost_inflation_rate": {"type": "number", "default": 0.05},
            },
            "required": ["child_birth_year", "current_year", "current_529_balance", "annual_contribution", "expected_return", "target_school_type", "current_annual_costs"],
        },
    },
    {
        "name": "compound_growth",
        "description": "Project future value of a 529 balance with a given annual contribution and rate.",
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
    "college_projection": college_projection,
    "compound_growth": compound_growth,
}


class CollegeAgent(BaseAgent):
    def analyze(self, question: str, data: dict) -> str:
        college_data = data.get("college", {})
        profile = data.get("profile", {})
        current_year = date.today().year

        user_message = (
            f"Question: {question}\n\n"
            f"Current year: {current_year}\n\n"
            f"Profile:\n{json.dumps(profile, indent=2)}\n\n"
            f"College Data:\n{json.dumps(college_data, indent=2)}"
        )
        return self._run_agentic_loop(SYSTEM, user_message, TOOLS, HANDLERS)
