"""Shared base class for all specialist agents."""

import json
from anthropic import Anthropic

MODEL = "claude-sonnet-4-6"


def _text_from_response(response) -> str:
    return " ".join(
        block.text for block in response.content if hasattr(block, "text")
    )


class BaseAgent:
    def __init__(self, client: Anthropic):
        self.client = client

    def _run_agentic_loop(
        self,
        system: str,
        user_message: str,
        tools: list[dict],
        tool_handlers: dict,
        max_iterations: int = 10,
    ) -> str:
        messages = [{"role": "user", "content": user_message}]

        for _ in range(max_iterations):
            response = self.client.messages.create(
                model=MODEL,
                max_tokens=8096,
                system=system,
                tools=tools,
                messages=messages,
            )

            if response.stop_reason == "end_turn":
                return _text_from_response(response)

            # Collect tool calls and results
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    handler = tool_handlers.get(block.name)
                    if handler:
                        try:
                            result = handler(**block.input)
                        except Exception as e:
                            result = {"error": str(e)}
                    else:
                        result = {"error": f"Unknown tool: {block.name}"}
                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    })

            messages.append({"role": "assistant", "content": response.content})
            messages.append({"role": "user", "content": tool_results})

        return "Analysis incomplete — reached maximum iterations."
