# Financial Advisor — Claude Code Context

This project gives Claude Code full visibility into your household finances so you can ask plain-English questions from any terminal session.

## How it works

- **`data/`** — your personal JSON files (gitignored, never committed)
- **`schemas/`** — template files with field documentation; copy to `data/` to get started
- **`tools/financial_tools.py`** — pure financial math (compound growth, retirement projections, etc.)
- **`agents/orchestrator.py`** — multi-agent system that routes questions to the right specialist
- **`mcp_server.py`** — MCP server that exposes your data as Claude Code tools
- **`dashboard/`** — FastAPI backend + React/Vite frontend for a visual dashboard

## Quick start

```bash
python3 main.py "Am I on track for retirement at 65?"
python3 main.py --update        # edit all data files
python3 main.py --update retirement  # edit one file
```

## Dashboard

```bash
# Backend (port 8000)
cd dashboard/backend && uvicorn main:app

# Frontend (port 5173)
cd dashboard/frontend && npm run dev
```

## Data files

All personal data lives in `data/*.json`. The schemas in `schemas/` document every field. Use `_comment` keys freely — they are stripped at load time.

## API key

The app looks for your Anthropic API key in:
1. `ANTHROPIC_API_KEY` environment variable
2. macOS Keychain: `security add-generic-password -a $USER -s anthropic_api_key -w "sk-ant-..."`

## MCP server (optional)

Register `mcp_server.py` in `.claude/settings.json` to access your finances as Claude Code tools in any session:

```json
{
  "mcpServers": {
    "financial-advisor": {
      "command": "python3",
      "args": ["/path/to/financial-advisor-template/mcp_server.py"]
    }
  }
}
```

Then ask Claude Code: `What's my net worth?` or `How much do I need to save for retirement?`
