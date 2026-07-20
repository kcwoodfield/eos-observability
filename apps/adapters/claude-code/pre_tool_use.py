#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

"""
EOS-Observability — PreToolUse safety gate.

Blocks dangerous `rm -rf`-style commands and access to `.env` files, mirroring
the equivalent guardrail already required of AI agents in eos/EOS.md ("never
expose or commit secrets"). Runs alongside, not instead of, send_event.py.
"""

import json
import sys
import re


def is_dangerous_rm_command(command: str) -> bool:
    normalized = ' '.join(command.lower().split())

    patterns = [
        r'\brm\s+.*-[a-z]*r[a-z]*f',
        r'\brm\s+.*-[a-z]*f[a-z]*r',
        r'\brm\s+--recursive\s+--force',
        r'\brm\s+--force\s+--recursive',
        r'\brm\s+-r\s+.*-f',
        r'\brm\s+-f\s+.*-r',
    ]
    if any(re.search(p, normalized) for p in patterns):
        return True

    dangerous_paths = [r'/', r'/\*', r'~', r'~/', r'\$HOME', r'\.\.', r'\*', r'\.', r'\.\s*$']
    if re.search(r'\brm\s+.*-[a-z]*r', normalized):
        return any(re.search(p, normalized) for p in dangerous_paths)

    return False


def is_env_file_access(tool_name: str, tool_input: dict) -> bool:
    if tool_name in ('Read', 'Edit', 'MultiEdit', 'Write'):
        file_path = tool_input.get('file_path', '')
        return '.env' in file_path and not file_path.endswith('.env.sample')

    if tool_name == 'Bash':
        command = tool_input.get('command', '')
        patterns = [
            r'\b\.env\b(?!\.sample)',
            r'cat\s+.*\.env\b(?!\.sample)',
            r'echo\s+.*>\s*\.env\b(?!\.sample)',
            r'touch\s+.*\.env\b(?!\.sample)',
            r'cp\s+.*\.env\b(?!\.sample)',
            r'mv\s+.*\.env\b(?!\.sample)',
        ]
        return any(re.search(p, command) for p in patterns)

    return False


def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)

    tool_name = input_data.get('tool_name', '')
    tool_input = input_data.get('tool_input', {})

    if is_env_file_access(tool_name, tool_input):
        print("BLOCKED: access to .env files is prohibited (use .env.sample)", file=sys.stderr)
        sys.exit(2)  # exit code 2 blocks the tool call and surfaces the message to Claude

    if tool_name == 'Bash' and is_dangerous_rm_command(tool_input.get('command', '')):
        print("BLOCKED: dangerous rm command detected", file=sys.stderr)
        sys.exit(2)

    sys.exit(0)


if __name__ == '__main__':
    main()
