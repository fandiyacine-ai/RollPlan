#!/usr/bin/env python3
"""
PostToolUse hook: run tsc --noEmit after Write/Edit on TypeScript files.
Reads tool input from stdin, skips non-TS files silently.
"""
import json
import subprocess
import sys
import os

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)

    file_path = (
        data.get("tool_input", {}).get("file_path") or
        data.get("tool_response", {}).get("filePath") or
        ""
    )

    if not file_path.endswith((".ts", ".tsx")):
        sys.exit(0)

    project_root = "/Users/yacinefandi/Documents/Claude Code/rollplan"

    result = subprocess.run(
        ["npx", "tsc", "--noEmit", "--incremental"],
        cwd=project_root,
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        errors = (result.stdout + result.stderr).strip()
        output = {
            "systemMessage": f"TypeScript errors detected:\n{errors[:2000]}",
        }
        print(json.dumps(output))
        sys.exit(0)

if __name__ == "__main__":
    main()
