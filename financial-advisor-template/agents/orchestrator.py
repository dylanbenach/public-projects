"""Orchestrator agent: routes financial questions to the right specialist(s)."""

import json
from anthropic import Anthropic
from .base import BaseAgent, MODEL
from .retirement import RetirementAgent
from .real_estate import RealEstateAgent
from .college import CollegeAgent
from .portfolio import PortfolioAgent

SYSTEM = """You are a personal financial advisor orchestrator. Your job is to:
1. Understand the user's question
2. Call the appropriate specialist agent(s) using the available tools
3. Synthesize their responses into a clear, actionable answer

You have four specialists available:
- retirement: 401k, IRA, Roth IRA projections, contribution strategy, Roth conversions
- real_estate: mortgage analysis, home equity, rent-vs-buy decisions
- college: 529 plans, tuition projections, savings gaps for each child
- portfolio: taxable brokerage accounts, stock/ETF allocation, watchlist review, tax efficiency

Call multiple specialists when the question spans domains (e.g., "where should I invest my extra $2k/month?" touches all four). Synthesize their outputs into one cohesive recommendation."""

TOOLS = [
    {
        "name": "ask_retirement_agent",
        "description": "Ask the retirement specialist about 401k, IRA, Roth accounts, contribution strategy, projections, and Roth conversion analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The specific retirement-related question to answer"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "ask_real_estate_agent",
        "description": "Ask the real estate specialist about mortgage balances, home equity, LTV, payoff timelines, and rent-vs-buy analysis.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "ask_college_agent",
        "description": "Ask the college planning specialist about 529 balances, projected college costs, funding gaps, and contribution recommendations per child.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
            },
            "required": ["question"],
        },
    },
    {
        "name": "ask_portfolio_agent",
        "description": "Ask the portfolio specialist about taxable brokerage holdings, allocation drift, watchlist stocks, tax-loss harvesting, and near-term investment decisions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
            },
            "required": ["question"],
        },
    },
]


class FinancialOrchestrator:
    def __init__(self, client: Anthropic, data: dict):
        self.client = client
        self.data = data
        self.specialists = {
            "retirement": RetirementAgent(client),
            "real_estate": RealEstateAgent(client),
            "college": CollegeAgent(client),
            "portfolio": PortfolioAgent(client),
        }

    def _call_specialist(self, name: str, question: str) -> str:
        agent = self.specialists[name]
        return agent.analyze(question, self.data)

    def ask(self, question: str) -> str:
        messages = [{"role": "user", "content": question}]

        # Brief data summary so the orchestrator knows what's available
        data_summary = {
            "has_retirement_accounts": bool(self.data.get("retirement", {}).get("accounts")),
            "has_real_estate": bool(self.data.get("real_estate", {}).get("properties")),
            "has_children": bool(self.data.get("college", {}).get("children")),
            "has_portfolio": bool(self.data.get("portfolio", {}).get("accounts")),
            "profile_age": self.data.get("profile", {}).get("age"),
        }

        system_with_context = (
            SYSTEM + f"\n\nData availability: {json.dumps(data_summary)}"
        )

        for _ in range(10):
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=8096,
                system=system_with_context,
                tools=TOOLS,
                messages=messages,
            )

            if response.stop_reason == "end_turn":
                return " ".join(
                    block.text for block in response.content if hasattr(block, "text")
                )

            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    specialist_name = block.name.replace("ask_", "").replace("_agent", "")
                    result = self._call_specialist(specialist_name, block.input["question"])
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": result,
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        return "Could not complete analysis — reached maximum iterations."
