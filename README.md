# Public Projects

Two fully functional apps you can clone, customize with your own data, and run today.

---

## Golf Trip Scoring App

> Real-time team scoring for your golf trip — built for groups of up to 12 players across two teams.

Live leaderboards, player bios with photos, and hole-by-hole scoring that syncs instantly across every phone at the table. Built on React Native + Firebase so it works offline too.

**What you get:**
- Live score sync via Firestore (everyone sees updates instantly)
- Team vs. team leaderboard with match-play scoring
- Player bios with photos stored in Firebase Storage
- iOS + Android builds via EAS — one command to ship to your friends

**Setup time:** ~20 minutes to get it running on your phone.

**[→ Get started](./golf-trip-template/README.md)**

---

## Personal Financial Advisor

> Ask plain-English questions about your finances and get a real answer — powered by Claude AI.

Type a question in your terminal. A multi-agent AI system routes it to the right specialist, does the math against your actual data, and gives you a clear answer. Or pull up the dashboard in your browser for visual charts.

```
$ python3 main.py "Am I on track for retirement at 65?"

Analyzing: Am I on track for retirement at 65?

Your portfolio is projected to reach $2.1M by age 65 (~$7,000/mo under the 4% rule).
Your target is $10,000/mo — you have a $3,000/mo shortfall.

To close it: increase annual contributions by $8,500/yr, or push retirement to 68.
```

**What you get:**
- CLI advisor with multi-agent AI (retirement, college, real estate, portfolio specialists)
- Interactive browser dashboard (net worth, retirement projections, 529 tracker, RSU tracker)
- MCP server — register it in Claude Code so your finances are one question away in any session
- PDF statement importer — drop in a bank/brokerage PDF and it updates your data files automatically
- All data stays local (gitignored JSON files, never leaves your machine)

**Setup time:** ~15 minutes to fill in your data and start asking questions.

**[→ Get started](./financial-advisor-template/README.md)**

---

## Quick start

```bash
git clone https://github.com/dylanbenach/public-projects
```

Then follow the README in whichever project you want to run first.
