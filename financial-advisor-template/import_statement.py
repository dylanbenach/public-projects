#!/usr/bin/env python3
"""Parse financial statement PDFs and update data/*.json files.

Runs entirely locally — no API calls, no cost. Uses institution-specific
pattern matching. Supports Bank of America, Chase, Fidelity, Vanguard,
Schwab, and generic mortgage/loan statements. New institutions are added
by dropping in a parser class below.

Usage:
  python3 import_statement.py ~/Downloads/eStmt_2026-05-20.pdf
  python3 import_statement.py ~/Downloads/*.pdf
"""

import sys
import json
import re
from datetime import datetime
from pathlib import Path

try:
    from pdfminer.high_level import extract_text
except ImportError:
    print("Missing dependency. Run: pip3 install pdfminer.six")
    sys.exit(1)

DATA_DIR = Path(__file__).parent / "data"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _amount(s: str) -> float:
    """'$1,234.56' or '1,234.56' or '-1,234.56' → float"""
    return float(re.sub(r'[,$]', '', s))


def _parse_date(s: str) -> str:
    """'May 20, 2026' or '05/20/26' → 'YYYY-MM-DD', or '' on failure"""
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%m/%d/%y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return ""


def _clean_employer(raw: str) -> str:
    """'ACME CORP LLC' → 'Acme Corp'"""
    stop = {"LLC", "INC", "CORP", "LTD", "US", "USA", "CO", "THE"}
    words = [w.title() for w in raw.split() if w.upper() not in stop]
    return " ".join(words) if words else raw.title()


# ---------------------------------------------------------------------------
# Institution parsers
# ---------------------------------------------------------------------------

class BofAParser:
    """Bank of America checking and savings statements."""

    _PRODUCT_TYPES = [
        ("adv plus banking", "checking"),
        ("advantage plus banking", "checking"),
        ("advantage safebalance", "checking"),
        ("core checking", "checking"),
        ("rewards savings", "savings"),
        ("advantage savings", "savings"),
        ("regular savings", "savings"),
    ]

    def detect(self, text: str) -> bool:
        return "bank of america" in text.lower()

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Bank of America"}}

        # Account type from product name
        account_type = "checking"
        m = re.search(r"Your Bank of America (.+?)(?:\n|Preferred Rewards)", text, re.IGNORECASE)
        if m:
            product = m.group(1).strip().lower()
            for keyword, atype in self._PRODUCT_TYPES:
                if keyword in product:
                    account_type = atype
                    break
        result["statement_summary"]["account_type"] = account_type

        # Account last 4
        m = re.search(r"Account number:\s*([\d\s]+)", text)
        if m:
            digits = re.sub(r"\s", "", m.group(1))
            result["statement_summary"]["account_last4"] = digits[-4:]

        # Statement period end
        m = re.search(r"to\s+(\w+ \d+,\s*\d{4})", text)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # Ending balance — last $X.XX in the Account Summary block
        # pdfminer extracts amounts at end of column, so the summary block has
        # beginning balance ($X.XX) first and ending balance ($X.XX) last.
        sm = re.search(
            r"Account summary([\s\S]+?)(?:IMPORTANT INFORMATION|Deposits and other additions\nDate)",
            text,
        )
        if sm:
            dollars = re.findall(r"\$([\d,]+\.\d{2})", sm.group(1))
            if dollars:
                last4 = result["statement_summary"].get("account_last4", "????")
                balance = _amount(dollars[-1])
                result["accounts"] = {
                    account_type: [{
                        "institution": "Bank of America",
                        "nickname": f"BofA {account_type.title()} ...{last4}",
                        "balance": balance,
                    }]
                }

        # Employer from payroll transaction
        m = re.search(r"([A-Z][A-Z\s&]+?)\s+DES:PAYROLL", text)
        if m:
            result["profile_hints"] = {"employer": _clean_employer(m.group(1).strip())}

        return result


class BofACreditCardParser:
    """Bank of America credit card monthly statements (Visa Signature, Cash Rewards, etc.)."""

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return "bank of america" in text_lower and (
            "visa signature" in text_lower
            or "account summary/payment information" in text_lower
            or ("new balance total" in text_lower and "credit line" in text_lower)
        )

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Bank of America", "account_type": "credit_card"}}

        # Account last 4 — "Account# 4400 6693 9934  0330" or "Account Number: ... 0330"
        m = re.search(r'Account#?\s*(?:[\d\s]+\s)?(\d{4})\s*\n', text)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        # Statement closing date
        m = re.search(r'Statement Closing Date\s+(\d{2}/\d{2}/\d{4})', text)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))
        else:
            m = re.search(r'[A-Z][a-z]+ \d+ [-–] ([A-Z][a-z]+ \d+, \d{4})', text)
            if m:
                result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # New balance — scan up to 400 chars after the label for the first signed dollar amount
        m = re.search(r'New Balance Total\b([\s\S]{0,400}?)(-?\$[\d,]+\.\d{2})', text)
        balance = _amount(m.group(2)) if m else None

        # Credit limit — column layout puts the balance before the limit in the amounts column.
        # Skip amounts < $5,000 (likely the balance) and take the first large value.
        credit_limit = None
        m = re.search(r'Total Credit Line([\s\S]{0,600})', text)
        if m:
            for amt_str in re.findall(r'[\d,]+\.\d{2}', m.group(1)):
                val = _amount(amt_str)
                if val >= 5000:
                    credit_limit = val
                    break

        # Card product name
        card_name = "Credit Card"
        for name in ("Visa Signature", "Cash Rewards", "Travel Rewards", "Customized Cash Rewards"):
            if name.lower() in text.lower():
                card_name = name
                break

        if balance is not None or credit_limit is not None:
            last4 = result["statement_summary"].get("account_last4", "????")
            entry = {
                "institution": "Bank of America",
                "name": card_name,
                "nickname": f"BofA {card_name} ...{last4}",
            }
            if balance is not None:
                entry["balance"] = balance  # negative = credit (they owe you), positive = you owe them
            if credit_limit is not None:
                entry["credit_limit"] = credit_limit
            result["accounts"] = {"credit_cards": [entry]}

        return result


class BofAYearEndParser:
    """Bank of America credit card year-end spending summary."""

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return ("year-end summary" in text_lower or "year end summary" in text_lower) \
               and "bank of america" in text_lower

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Bank of America", "account_type": "year_end_summary"}}

        m = re.search(r'credit card ending in (\d{4})', text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        m = re.search(r'credit card in (\d{4})', text, re.IGNORECASE)
        if m:
            year = m.group(1)
            result["statement_summary"]["statement_period_end"] = f"{year}-12-31"

        m = re.search(r'Total spent\s*\$?([\d,]+\.\d{2})', text, re.IGNORECASE)
        total_spent = _amount(m.group(1)) if m else None

        monthly_raw = re.findall(r'(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\n([\d,]+\.\d{2})', text)
        monthly = {k: float(v.replace(",", "")) for k, v in monthly_raw}
        avg_monthly = round(sum(monthly.values()) / len(monthly), 2) if monthly else None

        categories = {}
        for pattern, key in [
            (r'Merchandise\s+\$?([\d,]+\.\d{2})', "merchandise"),
            (r'Entertainment\s+\$?([\d,]+\.\d{2})', "entertainment"),
            (r'Health\s+\$?([\d,]+\.\d{2})', "health"),
            (r'Travel and\s+Transportation\s+\$?([\d,]+\.\d{2})', "travel_and_transportation"),
            (r'Services\s+\$?([\d,]+\.\d{2})', "services"),
        ]:
            cm = re.search(pattern, text, re.IGNORECASE)
            if cm:
                categories[key] = _amount(cm.group(1))

        hints = {}
        if total_spent:
            year_str = result["statement_summary"].get("statement_period_end", "")[:4] or "unknown"
            hints["annual_card_spending"] = total_spent
        if avg_monthly:
            hints["avg_monthly_card_spending"] = avg_monthly
        if categories:
            hints["spending_by_category"] = categories
        if total_spent:
            hints["note"] = f"BofA card only ({year_str}) — combine with other spending for full monthly_expenses"
        if hints:
            result["profile_hints"] = hints

        return result


class ChaseCheckingParser:
    """Chase Total Checking / Premier Plus / Sapphire checking statements."""

    _ACCOUNT_NAMES = [
        "Chase Total Checking", "Chase Premier Plus Checking",
        "Chase Sapphire Checking", "Chase Secure Checking",
    ]

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return ("jpmorgan chase" in text_lower or "chase.com" in text_lower) and (
            "checking summary" in text_lower
            or any(n.lower() in text_lower for n in self._ACCOUNT_NAMES)
        )

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Chase", "account_type": "checking"}}

        # Account last 4 — works for both "000000770929126" and "XXXX XXXX XXXX 9126"
        m = re.search(r'Account Number:\s*([\dX\s]+)', text)
        if m:
            digits = re.sub(r'[X\s]', '', m.group(1))
            if digits:
                result["statement_summary"]["account_last4"] = digits[-4:]

        # Period end — "April 15, 2026 through May 14, 2026"
        m = re.search(r'through\s+(\w+ \d+,\s*\d{4})', text, re.IGNORECASE)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # Account product name for nickname
        nickname_base = "Chase Checking"
        for name in self._ACCOUNT_NAMES:
            if name.lower() in text.lower():
                nickname_base = name
                break

        # Ending balance — prefer the summary block, fall back to transaction detail footer
        ending = None
        for pattern in [
            r'Ending Balance\s+\$([\d,]+\.\d{2})',
            r'Ending Balance\s+([\d,]+\.\d{2})',
        ]:
            m = re.search(pattern, text)
            if m:
                ending = _amount(m.group(1))
                break

        if ending is not None:
            last4 = result["statement_summary"].get("account_last4", "????")
            result["accounts"] = {
                "checking": [{
                    "institution": "Chase",
                    "nickname": f"{nickname_base} ...{last4}",
                    "balance": ending,
                }]
            }

        return result


class ChaseCreditCardParser:
    """Chase credit card statements (Sapphire, Freedom, Southwest, United, etc.)."""

    # Maps text fragment → clean card name
    _CARD_NAMES = [
        ("southwest", "Southwest Rapid Rewards"),
        ("sapphire reserve", "Sapphire Reserve"),
        ("sapphire preferred", "Sapphire Preferred"),
        ("sapphire", "Sapphire"),
        ("freedom unlimited", "Freedom Unlimited"),
        ("freedom flex", "Freedom Flex"),
        ("freedom", "Freedom"),
        ("united", "United Explorer"),
        ("amazon", "Amazon Prime"),
        ("ink business", "Ink Business"),
    ]

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return ("chase.com" in text_lower or "jpmorgan" in text_lower) and (
            "credit access line" in text_lower
            or "account activity" in text_lower
            or "rapid rewards" in text_lower
            or "sapphire" in text_lower
            or "freedom" in text_lower
        )

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Chase", "account_type": "credit_card"}}

        # Account last 4
        m = re.search(r'Account Number:\s*([\dX\s]+)', text)
        if m:
            digits = re.sub(r'[X\s]', '', m.group(1))
            if digits:
                result["statement_summary"]["account_last4"] = digits[-4:]

        # Statement closing date — "Opening/Closing Date  04/10/26 - 05/09/26"
        m = re.search(r'Opening/Closing Date\s+([\d/]+)\s*[-–]\s*([\d/]+)', text)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(2))
        else:
            # Fallback: "Statement Date: 05/09/26"
            m = re.search(r'Statement Date:\s+([\d/]+)', text)
            if m:
                result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # New balance
        m = re.search(r'New Balance\s+\$?([\d,]+\.\d{2})', text)
        balance = _amount(m.group(1)) if m else None

        # Credit limit — column layout; skip amounts < $5,000, take first large value
        credit_limit = None
        m = re.search(r'Credit Access Line([\s\S]{0,600})', text)
        if m:
            for amt_str in re.findall(r'[\d,]+', m.group(1)):
                val = float(amt_str.replace(",", ""))
                if val >= 5000:
                    credit_limit = val
                    break

        # Card name
        card_name = "Chase Credit Card"
        text_lower = text.lower()
        for fragment, name in self._CARD_NAMES:
            if fragment in text_lower:
                card_name = name
                break

        if balance is not None or credit_limit is not None:
            last4 = result["statement_summary"].get("account_last4", "????")
            entry = {
                "institution": "Chase",
                "name": card_name,
                "nickname": f"Chase {card_name} ...{last4}",
            }
            if balance is not None:
                entry["balance"] = balance
            if credit_limit is not None:
                entry["credit_limit"] = credit_limit
            result["accounts"] = {"credit_cards": [entry]}

        return result


class FidelityNetBenefitsParser:
    """Fidelity NetBenefits workplace retirement plan statements (401k, Roth 401k).
    Handles print-to-PDF exports from workplaceservices.fidelity.com."""

    def detect(self, text: str) -> bool:
        # "NetBeneﬁts" uses a fi ligature (U+FB01) in pdfminer extraction
        return "netbeneﬁts" in text.lower() or \
               "netbenefits" in text.lower() or \
               "workplaceservices.fidelity.com" in text.lower()

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Fidelity", "account_type": "401k"}}

        # Plan name — first bold heading after "Statement Details"
        # Capture plan name between "Statement Details" and the trailing all-caps account holder name
        m = re.search(r'Statement Details\s+(.+?)\s+(?:[A-Z]{2,}\s*)+$', text, re.MULTILINE)
        plan_name = m.group(1).strip() if m else "Workplace 401(k)"
        result["statement_summary"]["plan_name"] = plan_name

        # Infer account type from plan name / contributions
        text_lower = text.lower()
        is_roth = bool(re.search(r'roth\s+\$[\d,]+\.\d{2}', text, re.IGNORECASE)) and \
                  not bool(re.search(r'traditional.*\$[1-9]', text, re.IGNORECASE))
        account_type = "roth_401k" if is_roth else "401k"
        result["statement_summary"]["account_type"] = account_type

        # Statement period end
        m = re.search(r'Statement Period:.*?to\s+(\d{2}/\d{2}/\d{4})', text)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # Ending balance
        m = re.search(r'Ending Balance\s+\$?([\d,]+\.\d{2})', text)
        balance = _amount(m.group(1)) if m else None

        # Outstanding loan balance
        m = re.search(r'Outstanding Loan Balance\s+\$?([\d,]+\.\d{2})', text)
        loan_balance = _amount(m.group(1)) if m else None

        # Quarterly contributions — employee and employer
        m = re.search(r'Employee Contributions\s+\$?([\d,]+\.\d{2})', text)
        quarterly_employee = _amount(m.group(1)) if m else 0.0

        m = re.search(r'Employer Contributions\s+\$?([\d,]+\.\d{2})', text)
        if not m:
            m = re.search(r'Safe\s+Harbor.*?Match.*?\$?([\d,]+\.\d{2})', text)
        quarterly_employer = _amount(m.group(1)) if m else 0.0

        annual_employee = round(quarterly_employee * 4, 2)
        annual_employer = round(quarterly_employer * 4, 2)

        # Employer name from plan name
        employer = "Unknown"
        for name in ("IBM", "Microsoft", "Google", "Amazon", "Apple", "Meta", "Pfizer", "Johnson & Johnson"):
            if name.lower() in plan_name.lower() or name.lower() in text_lower:
                employer = name
                break

        if balance is not None:
            acct = {
                "type": account_type,
                "owner": "self",
                "institution": "Fidelity",
                "plan_name": plan_name,
                "employer": employer,
                "balance": balance,
                "annual_employee_contribution": annual_employee,
                "annual_employer_match": annual_employer,
                "expected_annual_return": 0.07,
            }
            if loan_balance:
                acct["outstanding_loan_balance"] = loan_balance
            result["retirement"] = {"accounts": [acct]}

        return result


class FidelityParser:
    """Fidelity brokerage, 401k, and IRA statements."""

    def detect(self, text: str) -> bool:
        return "fidelity" in text.lower() and "fidelity investments" in text.lower()

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Fidelity"}}

        # Detect account type
        text_lower = text.lower()
        if "401(k)" in text_lower or "401k" in text_lower:
            account_type = "401k"
        elif "roth ira" in text_lower:
            account_type = "roth_ira"
        elif "traditional ira" in text_lower:
            account_type = "ira"
        else:
            account_type = "brokerage"
        result["statement_summary"]["account_type"] = account_type

        # Account number last 4
        m = re.search(r"(?:Account|Acct)[.# ]*(?:Number|No\.?|#)?\s*[X*\d-]*?(\d{4})\b", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        # Period end
        m = re.search(r"(?:Statement Period|Period Ending|As of)[:\s]+(.+?\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1).strip())

        # Total account value
        m = re.search(
            r"(?:Total Account Value|Portfolio Value|Account Value|Ending Value|Total Value)\s*\n?\s*\$?([\d,]+\.\d{2})",
            text, re.IGNORECASE,
        )
        if m:
            value = _amount(m.group(1))
            if account_type in ("401k", "roth_ira", "ira"):
                result["retirement"] = {
                    "accounts": [{
                        "type": account_type,
                        "owner": "self",
                        "institution": "Fidelity",
                        "balance": value,
                    }]
                }
            else:
                result["portfolio"] = {
                    "accounts": [{
                        "institution": "Fidelity",
                        "account_type": "taxable_brokerage",
                        "total_value": value,
                        "holdings": _parse_fidelity_holdings(text),
                    }]
                }

        return result


def _parse_fidelity_holdings(text: str) -> list:
    """Best-effort extraction of individual positions from a Fidelity statement."""
    holdings = []
    # Pattern: ticker, shares, price columns (varies by statement format)
    for m in re.finditer(
        r"([A-Z]{1,5})\s+[\w\s]+?\s+([\d,]+\.?\d*)\s+(?:shares?)?\s*\$?([\d,]+\.\d{2})",
        text, re.IGNORECASE,
    ):
        ticker, shares, price = m.group(1), m.group(2), m.group(3)
        try:
            holdings.append({
                "ticker": ticker,
                "shares": float(shares.replace(",", "")),
                "current_price": _amount(price),
                "cost_basis_per_share": 0.0,
                "asset_class": "us_equity",
            })
        except ValueError:
            continue
    return holdings


class VanguardParser:
    """Vanguard brokerage and IRA statements."""

    def detect(self, text: str) -> bool:
        return "vanguard" in text.lower()

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Vanguard"}}

        text_lower = text.lower()
        if "roth ira" in text_lower:
            account_type = "roth_ira"
        elif "traditional ira" in text_lower or "ira brokerage" in text_lower:
            account_type = "ira"
        else:
            account_type = "brokerage"
        result["statement_summary"]["account_type"] = account_type

        m = re.search(r"Account\s+(?:number|#)[:\s]*[X*-]*(\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        m = re.search(r"(?:Statement|Period|As of)[:\s]+.+?(\w+ \d+,\s*\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        m = re.search(
            r"(?:Total Account Value|Portfolio Balance|Account Balance|Ending Balance)\s*\$?([\d,]+\.\d{2})",
            text, re.IGNORECASE,
        )
        if m:
            value = _amount(m.group(1))
            if account_type in ("roth_ira", "ira"):
                result["retirement"] = {
                    "accounts": [{"type": account_type, "owner": "self", "institution": "Vanguard", "balance": value}]
                }
            else:
                result["portfolio"] = {
                    "accounts": [{"institution": "Vanguard", "account_type": "taxable_brokerage", "total_value": value, "holdings": []}]
                }

        return result


class SchwabParser:
    """Charles Schwab brokerage statements."""

    def detect(self, text: str) -> bool:
        return "schwab" in text.lower() and ("charles" in text.lower() or "brokerage" in text.lower())

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Schwab"}}

        text_lower = text.lower()
        account_type = "roth_ira" if "roth" in text_lower else "ira" if "ira" in text_lower else "brokerage"
        result["statement_summary"]["account_type"] = account_type

        m = re.search(r"Account\s+(?:Number|#)[:\s]*[X*-]*(\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        m = re.search(r"(?:As of|Period Ending|Statement Date)[:\s]+(.+?\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1).strip())

        m = re.search(
            r"(?:Total Market Value|Account Total|Portfolio Total|Total Value)\s*\$?([\d,]+\.\d{2})",
            text, re.IGNORECASE,
        )
        if m:
            value = _amount(m.group(1))
            if account_type in ("roth_ira", "ira"):
                result["retirement"] = {
                    "accounts": [{"type": account_type, "owner": "self", "institution": "Schwab", "balance": value}]
                }
            else:
                result["portfolio"] = {
                    "accounts": [{"institution": "Schwab", "account_type": "taxable_brokerage", "total_value": value, "holdings": []}]
                }

        return result


class MortgageParser:
    """Generic mortgage/loan servicer statements."""

    _SERVICER_HINTS = ["loan servicer", "mortgage", "home loan", "mr. cooper", "rocket mortgage",
                       "pennymac", "loancare", "newrez", "sls", "nationstar"]

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return any(h in text_lower for h in self._SERVICER_HINTS)

    def parse(self, text: str) -> dict:
        text_lower = text.lower()
        result = {"statement_summary": {"account_type": "mortgage"}}

        # Try to identify servicer name from first lines
        first_lines = text.strip().splitlines()[:6]
        for line in first_lines:
            line = line.strip()
            if len(line) > 3 and not re.match(r"^[\d\s]+$", line):
                result["statement_summary"]["institution"] = line
                break
        result["statement_summary"].setdefault("institution", "Mortgage Servicer")

        # Loan/account number last 4
        m = re.search(r"(?:Loan|Account)\s+(?:Number|#|No\.?)[:\s]*[X*-]*(\d{4})\b", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)

        # Statement date
        m = re.search(r"(?:Statement Date|As of|Date)[:\s]+(.+?\d{4})", text, re.IGNORECASE)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1).strip())

        # Principal balance (current mortgage balance)
        balance = None
        for pattern in [
            r"(?:Principal Balance|Unpaid Principal|Outstanding Balance|Current Balance|Loan Balance)\s*:?\s*\$?([\d,]+\.\d{2})",
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                balance = _amount(m.group(1))
                break

        # Monthly payment
        payment = None
        m = re.search(r"(?:Monthly Payment|Payment Amount|Total Payment Due|Amount Due)\s*:?\s*\$?([\d,]+\.\d{2})", text, re.IGNORECASE)
        if m:
            payment = _amount(m.group(1))

        # Interest rate
        rate = None
        m = re.search(r"(?:Interest Rate|Note Rate)\s*:?\s*([\d.]+)\s*%", text, re.IGNORECASE)
        if m:
            rate = float(m.group(1)) / 100

        if balance is not None:
            lender = result["statement_summary"]["institution"]
            mortgage_update = {"lender": lender, "current_balance": balance}
            if payment:
                mortgage_update["monthly_payment"] = payment
            if rate:
                mortgage_update["interest_rate"] = rate
            result["real_estate"] = {
                "properties": [{
                    "nickname": "Primary Home",
                    "mortgage": mortgage_update,
                }]
            }

        return result


class Form1098Parser:
    """IRS Form 1098 Mortgage Interest Statement (annual tax doc from any lender)."""

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return "form 1098" in text_lower or "mortgage interest statement" in text_lower

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"account_type": "mortgage_1098"}}

        # Tax year
        m = re.search(r'Year:\s*(\d{4})', text)
        if m:
            result["statement_summary"]["statement_period_end"] = f"{m.group(1)}-12-31"

        # Lender name — first non-empty, non-numeric line
        lender = "Mortgage Lender"
        for line in text.strip().splitlines()[:15]:
            line = line.strip()
            if len(line) > 5 and not re.match(r'^[\d\s\W]+$', line):
                lender = line
                break
        # Prefer explicit lender fields
        for pattern in [
            r"(?:First Home Mortgage|Tower Federal|Rocket Mortgage|Mr\. Cooper|PennyMac|LoanCare|NewRez|Nationstar)",
        ]:
            m = re.search(pattern, text, re.IGNORECASE)
            if m:
                lender = m.group(0).strip()
                break
        result["statement_summary"]["institution"] = lender

        # Loan number last 4
        m = re.search(r'Loan Number[:\s]*(\d+)', text, re.IGNORECASE)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1)[-4:]

        # Property address (Box 8)
        address = None
        m = re.search(r'(\d+ [A-Z][A-Z\s]+(?:LN|ST|RD|AVE|DR|CT|WAY|BLVD|PL)\b[^\n]*)', text)
        if m:
            address = m.group(1).strip().title()

        # --- Core 1098 fields ---
        # These sections use a column layout: all labels appear together, then all
        # amounts appear together in the same order. We match the label block, then
        # extract amounts positionally from what follows.

        # Principal Reconciliation block
        # Labels: Current Total Payment / Beginning Balance / Applied Principal / Ending Balance
        # Amounts (same order): payment / jan1 balance / principal applied / ending balance
        monthly_payment = jan1_balance = ending_balance = None
        m = re.search(
            r'Current Total Payment[\s\S]*?Ending Balance\s*\n\s*\n([\s\S]{0,200})',
            text
        )
        if m:
            vals = re.findall(r'[\d,]+\.\d{2}', m.group(1))
            if len(vals) >= 4:
                monthly_payment = _amount(vals[0])
                jan1_balance    = _amount(vals[1])
                ending_balance  = _amount(vals[3])

        # Interest Reconciliation block
        # Labels: Mortgage Interest Received / Late Charges Paid / Reimbursed Interest
        annual_interest = None
        m = re.search(
            r'Mortgage Interest Received[\s\S]*?Reimbursed Interest[\s\S]*?\n\s*\n([\s\S]{0,100})',
            text
        )
        if m:
            vals = re.findall(r'[\d,]+\.\d{2}', m.group(1))
            annual_interest = _amount(vals[0]) if vals else None

        # Fallback: IRS dense block has interest plainly — "$14,226.27$411,026.92…"
        if not annual_interest:
            m = re.search(r'\$([\d,]+\.\d{2})\$([\d,]+\.\d{2})\d{1,2}/\d{1,2}/20\d{2}', text)
            if m:
                annual_interest = _amount(m.group(1))
                if not jan1_balance:
                    jan1_balance = _amount(m.group(2))

        # Escrow block
        # Labels: Property Tax / Hazard Insurance / Mortgage Insurance / Escrow Refund
        annual_property_tax = annual_insurance = None
        m = re.search(
            r'Property Tax[\s\S]*?Escrow Refund[\s\S]*?\n\s*\n([\s\S]{0,100})',
            text
        )
        if m:
            vals = re.findall(r'[\d,]+\.\d{2}', m.group(1))
            if len(vals) >= 2:
                annual_property_tax = _amount(vals[0])
                annual_insurance    = _amount(vals[1])

        # Box 3: origination date — look for a date in 2010–2025 range
        m = re.search(r'\b(\d{1,2}/\d{1,2}/20(?:1[0-9]|2[0-5]))\b', text)
        origination_date = _parse_date(m.group(1)) if m else None

        # Infer interest rate from annual interest / avg principal
        inferred_rate = None
        if annual_interest and jan1_balance and ending_balance:
            avg_principal = (jan1_balance + ending_balance) / 2
            inferred_rate = round(annual_interest / avg_principal, 4)

        if ending_balance:
            mortgage = {
                "lender": lender,
                "current_balance": ending_balance,
                "balance_as_of": result["statement_summary"].get("statement_period_end", ""),
            }
            if monthly_payment:
                mortgage["monthly_payment"] = monthly_payment
            if inferred_rate:
                mortgage["interest_rate"] = inferred_rate
            if origination_date:
                mortgage["start_date"] = origination_date

            prop = {"nickname": "Primary Home", "mortgage": mortgage}
            if address:
                prop["address"] = address
            if annual_property_tax:
                prop["annual_property_tax"] = annual_property_tax
            if annual_insurance:
                prop["annual_insurance"] = annual_insurance

            result["real_estate"] = {"properties": [prop]}

        # Profile hints: annual interest is tax-deductible — useful to surface
        if annual_interest:
            result["profile_hints"] = {
                "mortgage_interest_paid": annual_interest,
                "note": "Mortgage interest may be deductible — see Schedule A",
            }

        return result


class Maryland529Parser:
    """Maryland College Investment Plan (T. Rowe Price) quarterly statements."""

    def detect(self, text: str) -> bool:
        text_lower = text.lower()
        return "maryland529" in text_lower or \
               "maryland college investment plan" in text_lower or \
               "save4college" in text_lower

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"institution": "Maryland 529", "account_type": "529"}}

        # Statement period end
        m = re.search(r'Statement Period:\s*[\d/]+ - ([\d/]+)', text)
        if m:
            result["statement_summary"]["statement_period_end"] = _parse_date(m.group(1))

        # Account number
        m = re.search(r'Account #:\s*([\w-]+)', text)
        if m:
            result["statement_summary"]["account_last4"] = m.group(1).replace("-", "")[-4:]

        # Beneficiary name
        m = re.search(r'Beneficiary:\s*([A-Z][a-z]+ [A-Z][a-z]+)', text)
        beneficiary = m.group(1).strip() if m else None

        # Account ending balance — column layout: labels block then amounts block in same order.
        # Order: Account Beginning, Change in Value, Account Ending, Principal, Earnings
        balance = None
        m = re.search(r'Account Beginning[\s\S]*?Earnings\s*\n\s*\n([\s\S]{0,200})', text)
        if m:
            vals = re.findall(r'-?[\d,]+\.\d{2}', m.group(1))
            if len(vals) >= 3:
                balance = _amount(vals[2])  # Account Ending is 3rd in sequence

        # Quarterly recurring contributions (first amount after "Quarterly Totals" header)
        quarterly_contrib = 0.0
        m = re.search(r'Quarterly Totals[\s\S]{0,150}?\$?([\d,]+\.\d{2})', text)
        if m:
            quarterly_contrib = _amount(m.group(1))

        if balance is not None and beneficiary:
            result["college"] = {
                "children": [{
                    "name": beneficiary,
                    "529_balance": balance,
                    "annual_529_contribution": round(quarterly_contrib * 4, 2),
                }]
            }

        return result


class CollegeParser:
    """529 plan statements (common providers: Vanguard, Fidelity, T. Rowe Price, etc.)."""

    def detect(self, text: str) -> bool:
        # \b529\b avoids false positives from numbers like "5295" in transfer confirmation numbers
        return bool(re.search(r'\b529\b', text, re.IGNORECASE)) or \
               "college savings" in text.lower() or "education savings" in text.lower()

    def parse(self, text: str) -> dict:
        result = {"statement_summary": {"account_type": "529"}}

        # Institution
        for name in ["Vanguard", "Fidelity", "T. Rowe Price", "Schwab", "TIAA", "CollegeAdvantage"]:
            if name.lower() in text.lower():
                result["statement_summary"]["institution"] = name
                break
        result["statement_summary"].setdefault("institution", "529 Provider")

        m = re.search(r"(?:Beneficiary|For the benefit of|Student)[:\s]+([A-Z][a-z]+ [A-Z][a-z]+)", text, re.IGNORECASE)
        beneficiary = m.group(1).strip() if m else None

        m = re.search(
            r"(?:Account Value|Total Value|Balance|Portfolio Value)\s*:?\s*\$?([\d,]+\.\d{2})",
            text, re.IGNORECASE,
        )
        if m and beneficiary:
            result["college"] = {
                "children": [{"name": beneficiary, "529_balance": _amount(m.group(1))}]
            }
        elif m:
            result["college"] = {
                "children": [{"name": "Unknown (update manually)", "529_balance": _amount(m.group(1))}]
            }

        return result


# Parser registry — checked in order; first match wins.
# Institution-specific parsers come first to avoid false positives from content-based parsers
# (e.g. a BofA statement mentioning "Fidelity" in transactions shouldn't trigger FidelityParser).
PARSERS = [
    BofAYearEndParser(),    # most specific BofA format — check before generic BofA
    BofACreditCardParser(), # credit card before checking (both say "Bank of America")
    BofAParser(),           # checking / savings
    ChaseCheckingParser(),  # checking before credit card (both say "Chase")
    ChaseCreditCardParser(),
    FidelityNetBenefitsParser(), # workplace 401k — before generic Fidelity
    FidelityParser(),
    VanguardParser(),
    SchwabParser(),
    Form1098Parser(),       # IRS 1098 mortgage interest statement (any lender)
    Maryland529Parser(),    # Maryland College Investment Plan — before generic CollegeParser
    CollegeParser(),        # content-based: must follow institution parsers
    MortgageParser(),       # content-based: catches generic servicer statements
]


def detect_and_parse(text: str) -> dict:
    for parser in PARSERS:
        if parser.detect(text):
            return parser.parse(text)
    return {"statement_summary": {"institution": "Unknown", "account_type": "unknown"}}


# ---------------------------------------------------------------------------
# Data file merge logic (institution-agnostic)
# ---------------------------------------------------------------------------

def load_data_file(name: str) -> dict:
    path = DATA_DIR / f"{name}.json"
    if not path.exists():
        return {}
    with open(path) as f:
        return json.load(f)


def save_data_file(name: str, data: dict):
    path = DATA_DIR / f"{name}.json"
    path.parent.mkdir(exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def _match_by_institution(existing_list: list, institution: str) -> int:
    for i, item in enumerate(existing_list):
        if item.get("institution", "").lower() == institution.lower():
            return i
    return -1


def _match_account_type(existing_list: list, account_type: str, institution: str) -> int:
    for i, item in enumerate(existing_list):
        if (item.get("type", "").lower() == account_type.lower() and
                item.get("institution", "").lower() == institution.lower()):
            return i
    return -1


def merge_accounts(existing: dict, updates: dict) -> tuple[dict, list[str]]:
    changes = []
    for acct_type in ("checking", "savings", "credit_cards"):
        if acct_type not in updates:
            continue
        existing.setdefault(acct_type, [])
        for entry in updates[acct_type]:
            institution = entry.get("institution", "")
            nickname = entry.get("nickname", "")
            # For credit cards, match by nickname first (multiple cards from same bank)
            if acct_type == "credit_cards" and nickname:
                idx = next(
                    (i for i, x in enumerate(existing[acct_type])
                     if x.get("nickname", "").lower() == nickname.lower()),
                    _match_by_institution(existing[acct_type], institution),
                )
            else:
                idx = _match_by_institution(existing[acct_type], institution)
            label = nickname or institution
            if idx >= 0:
                old = existing[acct_type][idx].get("balance", 0)
                existing[acct_type][idx].update(entry)
                changes.append(f"  accounts/{acct_type} {label}: ${old:,.2f} → ${entry.get('balance', old):,.2f}")
            else:
                existing[acct_type].append(entry)
                changes.append(f"  accounts/{acct_type}: added {label} (balance ${entry.get('balance', 0):,.2f})")
    return existing, changes


def merge_retirement(existing: dict, updates: dict) -> tuple[dict, list[str]]:
    changes = []
    existing.setdefault("accounts", [])
    for acct in updates.get("accounts", []):
        idx = _match_account_type(existing["accounts"], acct.get("type", ""), acct.get("institution", ""))
        if idx >= 0:
            old = existing["accounts"][idx].get("balance", 0)
            existing["accounts"][idx].update({k: v for k, v in acct.items() if v})
            changes.append(f"  retirement {acct.get('type')} @ {acct.get('institution')}: ${old:,.2f} → ${acct.get('balance', old):,.2f}")
        else:
            existing["accounts"].append(acct)
            changes.append(f"  retirement: added {acct.get('type')} @ {acct.get('institution')} (${acct.get('balance', 0):,.2f})")
    return existing, changes


def merge_real_estate(existing: dict, updates: dict) -> tuple[dict, list[str]]:
    changes = []
    existing.setdefault("properties", [])
    for new_prop in updates.get("properties", []):
        lender = new_prop.get("mortgage", {}).get("lender", "")
        nickname = new_prop.get("nickname", "")
        idx = next(
            (i for i, p in enumerate(existing["properties"])
             if p.get("nickname", "").lower() == nickname.lower()
             or p.get("mortgage", {}).get("lender", "").lower() == lender.lower()),
            -1,
        )
        if idx >= 0:
            prop = existing["properties"][idx]
            if "mortgage" in new_prop and "current_balance" in new_prop["mortgage"]:
                old = prop.get("mortgage", {}).get("current_balance", 0)
                prop.setdefault("mortgage", {}).update(new_prop["mortgage"])
                changes.append(f"  mortgage @ {lender}: ${old:,.2f} → ${new_prop['mortgage']['current_balance']:,.2f}")
            if new_prop.get("current_estimated_value"):
                prop["current_estimated_value"] = new_prop["current_estimated_value"]
                changes.append(f"  property value updated to ${new_prop['current_estimated_value']:,.2f}")
        else:
            existing["properties"].append(new_prop)
            changes.append(f"  real_estate: added '{nickname}' (mortgage @ {lender})")
    return existing, changes


def merge_portfolio(existing: dict, updates: dict) -> tuple[dict, list[str]]:
    changes = []
    existing.setdefault("accounts", [])
    for acct in updates.get("accounts", []):
        institution = acct.get("institution", "")
        idx = _match_by_institution(existing["accounts"], institution)
        if idx >= 0:
            old = existing["accounts"][idx].get("total_value", 0)
            if acct.get("total_value"):
                existing["accounts"][idx]["total_value"] = acct["total_value"]
                changes.append(f"  portfolio @ {institution}: ${old:,.2f} → ${acct['total_value']:,.2f}")
            if acct.get("holdings"):
                existing["accounts"][idx]["holdings"] = acct["holdings"]
                changes.append(f"  portfolio @ {institution}: updated {len(acct['holdings'])} holdings")
        else:
            existing["accounts"].append(acct)
            changes.append(f"  portfolio: added {institution} (${acct.get('total_value', 0):,.2f})")
    return existing, changes


def merge_college(existing: dict, updates: dict) -> tuple[dict, list[str]]:
    changes = []
    existing.setdefault("children", [])
    for child in updates.get("children", []):
        name = child.get("name", "")
        idx = next((i for i, c in enumerate(existing["children"]) if c.get("name", "").lower() == name.lower()), -1)
        if idx >= 0:
            old = existing["children"][idx].get("529_balance", 0)
            existing["children"][idx].update({k: v for k, v in child.items() if v})
            changes.append(f"  529 for {name}: ${old:,.2f} → ${child.get('529_balance', old):,.2f}")
        else:
            existing["children"].append(child)
            changes.append(f"  college: added child '{name}'")
    return existing, changes


MERGERS = {
    "accounts": merge_accounts,
    "retirement": merge_retirement,
    "real_estate": merge_real_estate,
    "portfolio": merge_portfolio,
    "college": merge_college,
}


def apply_updates(extracted: dict) -> list[str]:
    all_changes = []
    for data_file, merger in MERGERS.items():
        if data_file not in extracted:
            continue
        existing = load_data_file(data_file)
        updated, changes = merger(existing, extracted[data_file])
        if changes:
            save_data_file(data_file, updated)
            all_changes.extend(changes)

    hints = extracted.get("profile_hints", {})
    if hints:
        all_changes.append("\n  Profile hints (review manually in data/profile.json):")
        if hints.get("employer"):
            all_changes.append(f"    employer: {hints['employer']}")
        if hints.get("monthly_take_home_estimate"):
            all_changes.append(f"    monthly take-home estimate: ${hints['monthly_take_home_estimate']:,.0f}")
        if hints.get("mortgage_interest_paid"):
            all_changes.append(f"    2025 mortgage interest paid: ${hints['mortgage_interest_paid']:,.2f} (tax-deductible if you itemize)")
        if hints.get("annual_card_spending"):
            all_changes.append(f"    annual card spending: ${hints['annual_card_spending']:,.2f}")
        if hints.get("avg_monthly_card_spending"):
            all_changes.append(f"    avg monthly card spending: ${hints['avg_monthly_card_spending']:,.2f}")
        if hints.get("spending_by_category"):
            all_changes.append("    spending by category:")
            for cat, amt in hints["spending_by_category"].items():
                all_changes.append(f"      {cat}: ${amt:,.2f}")
        if hints.get("note"):
            all_changes.append(f"    note: {hints['note']}")

    return all_changes


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def extract_pdf_text(pdf_path: Path) -> str:
    try:
        text = extract_text(str(pdf_path))
        return text
    except Exception as e:
        print(f"  Error reading PDF: {e}")
        return ""


def _is_scanned(text: str) -> bool:
    return len(text.strip()) < 20


def process_statement(pdf_path: Path):
    print(f"\nProcessing: {pdf_path.name}")
    text = extract_pdf_text(pdf_path)
    if _is_scanned(text):
        print("  Scanned/image PDF — text cannot be extracted automatically.")
        print("  To update manually, run: python3 main.py --update real_estate")
        print("  Key fields to enter from a Form 1098:")
        print("    Box 1: mortgage interest paid  |  Box 2: outstanding principal (Jan 1)")
        print("    Box 3: origination date  |  Ending balance if shown on annual statement")
        return

    extracted = detect_and_parse(text)
    summary = extracted.get("statement_summary", {})
    institution = summary.get("institution", "Unknown")
    account_type = summary.get("account_type", "unknown")
    last4 = summary.get("account_last4", "????")
    period = summary.get("statement_period_end", "unknown date")

    if institution == "Unknown":
        print(f"  Could not identify institution. Drop this PDF in a Claude Code chat")
        print(f"  and ask: 'Parse this statement and update my financial data files.'")
        return

    print(f"  Detected: {account_type} @ {institution} (...{last4}) through {period}")

    changes = apply_updates(extracted)
    if changes:
        print("  Updated:")
        for c in changes:
            print(c)
    else:
        print("  Nothing to update — no matching entries found in data/ files.")
        print("  Run 'python3 main.py --update' to set up your data files first.")


def main():
    paths = [Path(p).expanduser() for p in sys.argv[1:]]
    if not paths:
        print(__doc__)
        sys.exit(0)

    missing = [p for p in paths if not p.exists()]
    if missing:
        for p in missing:
            print(f"File not found: {p}", file=sys.stderr)
        sys.exit(1)

    for path in paths:
        process_statement(path)

    print("\nDone.")


if __name__ == "__main__":
    main()
