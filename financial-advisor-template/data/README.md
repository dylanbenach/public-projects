# data/

This directory holds your personal financial data as JSON files. It is **gitignored** — your data stays local.

## Setup

Copy each schema file from `../schemas/` to this directory and fill in your values:

```bash
cp ../schemas/profile.json profile.json
cp ../schemas/accounts.json accounts.json
cp ../schemas/retirement.json retirement.json
cp ../schemas/real_estate.json real_estate.json
cp ../schemas/college.json college.json
cp ../schemas/portfolio.json portfolio.json
```

Or use the CLI helper:

```bash
python3 main.py --update
```

This opens each file in your `$EDITOR` for you to fill in.

## Files

| File | Purpose |
|------|---------|
| `profile.json` | Household demographics, income, tax rates, action items |
| `accounts.json` | Checking, savings, loans, credit cards |
| `retirement.json` | 401k / IRA accounts with balances and contributions |
| `real_estate.json` | Properties, mortgages, HELOCs |
| `college.json` | 529 plans and college funding goals |
| `portfolio.json` | Brokerage accounts, RSU grants |
