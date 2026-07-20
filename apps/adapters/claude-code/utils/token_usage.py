"""Sum token usage from a Claude Code transcript (.jsonl), no LLM calls.

Every assistant message in the transcript carries the Anthropic API's `usage`
object for that turn. Summing across all of them gives the running total for
the session so far — each event's total is the cumulative figure as of that
event, not a per-turn delta, so a client only needs the most recent event per
session to show the session's current usage.
"""

import json
import os


def get_token_usage_from_transcript(transcript_path: str) -> dict | None:
    """Sum input/output/cache token usage across every assistant turn so far."""
    if not transcript_path or not os.path.exists(transcript_path):
        return None

    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()
    except IOError:
        return None

    totals = {
        'input_tokens': 0,
        'output_tokens': 0,
        'cache_creation_tokens': 0,
        'cache_read_tokens': 0,
    }
    found_any = False

    for line in lines:
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        if entry.get('type') != 'assistant':
            continue

        usage = entry.get('message', {}).get('usage')
        if not usage:
            continue

        found_any = True
        totals['input_tokens'] += usage.get('input_tokens', 0)
        totals['output_tokens'] += usage.get('output_tokens', 0)
        totals['cache_creation_tokens'] += usage.get('cache_creation_input_tokens', 0)
        totals['cache_read_tokens'] += usage.get('cache_read_input_tokens', 0)

    return totals if found_any else None
