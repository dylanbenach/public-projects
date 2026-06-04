#!/usr/bin/env python3
"""Personal financial advisor CLI.

Usage:
  python3 main.py "Am I on track for retirement at 65?"
  python3 main.py --update            # open all data files for editing
  python3 main.py --update retirement # open a specific data file
"""

import sys
import os
import json
import subprocess
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"
DATA_FILES = ["profile", "accounts", "retirement", "real_estate", "college", "portfolio"]


def get_api_key() -> str:
    # 1. Check environment variable
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        return key
    # 2. Fall back to macOS Keychain
    mac_user = os.environ.get("USER", "")
    result = subprocess.run(
        ["security", "find-generic-password", "-a", mac_user, "-s", "anthropic_api_key", "-w"],
        capture_output=True, text=True,
    )
    if result.returncode == 0:
        return result.stdout.strip()
    print(
        "ERROR: Anthropic API key not found.\n"
        "Store it with:\n"
        f'  security add-generic-password -a {mac_user} -s anthropic_api_key -w "YOUR_KEY"\n'
        "Or set the ANTHROPIC_API_KEY environment variable.",
        file=sys.stderr,
    )
    sys.exit(1)


def load_data() -> dict:
    data = {}
    missing = []
    for name in DATA_FILES:
        path = DATA_DIR / f"{name}.json"
        if not path.exists():
            missing.append(name)
            data[name] = {}
            continue
        with open(path) as f:
            raw = json.load(f)
            # Strip _comment keys — those are schema documentation
            data[name] = {k: v for k, v in raw.items() if not k.startswith("_")}
    if missing:
        print(f"Note: missing data files for: {', '.join(missing)}. Run --update to fill them in.", file=sys.stderr)
    return data


def update_data(target=None):
    editor = os.environ.get("EDITOR", "nano")
    files = DATA_FILES if target is None else [target]
    for name in files:
        path = DATA_DIR / f"{name}.json"
        if not path.exists():
            # Copy schema as starting point
            schema = Path(__file__).parent / "schemas" / f"{name}.json"
            if schema.exists():
                import shutil
                shutil.copy(schema, path)
                print(f"Created {path} from schema template.")
        subprocess.run([editor, str(path)])


def main():
    args = sys.argv[1:]

    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0)

    if args[0] == "--update":
        target = args[1] if len(args) > 1 else None
        if target and target not in DATA_FILES:
            print(f"Unknown data file '{target}'. Choose from: {', '.join(DATA_FILES)}")
            sys.exit(1)
        update_data(target)
        return

    question = " ".join(args)
    if not question.strip():
        print("Please provide a question.", file=sys.stderr)
        sys.exit(1)

    # Lazy imports — don't load anthropic until we need it
    from anthropic import Anthropic
    from agents.orchestrator import FinancialOrchestrator

    api_key = get_api_key()
    client = Anthropic(api_key=api_key)
    data = load_data()

    print(f"\nAnalyzing: {question}\n{'─' * 60}\n")
    orchestrator = FinancialOrchestrator(client, data)
    answer = orchestrator.ask(question)
    print(answer)
    print()


if __name__ == "__main__":
    main()
