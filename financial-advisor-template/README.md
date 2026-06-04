# Financial Advisor Template

A personal financial advisor powered by Claude AI. Ask plain-English questions about your finances from the terminal, or explore an interactive dashboard in your browser.

## Features

- **CLI advisor** — ask any financial question; a multi-agent system routes it to the right specialist
- **Interactive dashboard** — visual tabs for net worth, retirement projections, college funding, real estate, and portfolio
- **MCP server** — register as a Claude Code tool so you can query your finances from any session
- **All data stays local** — your JSON files are gitignored and never leave your machine

## Stack

| Layer | Tech |
|-------|------|
| Backend API | Python · FastAPI · uvicorn |
| Frontend | React · Vite · Tailwind CSS · Recharts |
| AI agents | Anthropic SDK · claude-opus-4 |
| MCP server | `mcp` (FastMCP) |

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/yourusername/public-projects
cd public-projects/financial-advisor-template

pip install -r requirements.txt
cd dashboard/frontend && npm install && cd ../..
```

### 2. Add your Anthropic API key

```bash
# Option A: environment variable
export ANTHROPIC_API_KEY="sk-ant-..."

# Option B: macOS Keychain (persists across sessions)
security add-generic-password -a $USER -s anthropic_api_key -w "sk-ant-..."
```

### 3. Create your data files

```bash
python3 main.py --update
```

This copies each schema from `schemas/` to `data/` and opens them in your `$EDITOR`. Fill in your real numbers. The `data/` directory is gitignored.

### 4. Run the CLI

```bash
python3 main.py "Am I on track for retirement at 65?"
python3 main.py "What's my net worth?"
python3 main.py "How much should I be contributing to my 529?"
```

### 5. Run the dashboard

```bash
# Terminal 1 — backend
cd dashboard/backend
uvicorn main:app

# Terminal 2 — frontend
cd dashboard/frontend
npm run dev
```

Open `http://localhost:5173`.

## Data files

Copy schemas from `schemas/` to `data/` and fill in your values:

```
schemas/profile.json      → data/profile.json
schemas/accounts.json     → data/accounts.json
schemas/retirement.json   → data/retirement.json
schemas/real_estate.json  → data/real_estate.json
schemas/college.json      → data/college.json
schemas/portfolio.json    → data/portfolio.json
```

Fields starting with `_` are treated as comments and stripped at load time — use them freely for notes.

## MCP server (optional)

Register `mcp_server.py` in `.claude/settings.json` to make your financial data available as Claude Code tools in any session:

```json
{
  "mcpServers": {
    "financial-advisor": {
      "command": "python3",
      "args": ["/absolute/path/to/financial-advisor-template/mcp_server.py"]
    }
  }
}
```

Available tools: `get_net_worth`, `get_retirement_projection`, `get_college_gap`, `get_real_estate_summary`, `get_financial_summary`.

## Context export (optional)

You can create an `export_context.py` script to dump a snapshot of your financial data as a Claude-readable text block — useful for pasting into a new session without the MCP server. For example, the script might read your JSON files, compute key metrics (net worth, cash flow, retirement trajectory), and print a formatted summary. The MCP server approach is generally more convenient for regular use.

## Project structure

```
financial-advisor-template/
├── main.py                  # CLI entry point
├── mcp_server.py            # MCP server (Claude Code tools)
├── requirements.txt
├── agents/
│   └── orchestrator.py      # Multi-agent routing
├── tools/
│   └── financial_tools.py   # Pure financial math functions
├── schemas/                 # Template JSON files (committed)
├── data/                    # Your personal data (gitignored)
└── dashboard/
    ├── backend/
    │   └── main.py          # FastAPI app
    └── frontend/
        └── src/
            └── tabs/        # Overview, Retirement, College, RealEstate, Portfolio
```
