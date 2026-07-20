"""Extract the model name from a Claude Code transcript (.jsonl), no LLM calls."""

import json
import os


def get_model_from_transcript(transcript_path: str) -> str:
    """Find the most recent assistant message's model field in a transcript."""
    if not transcript_path or not os.path.exists(transcript_path):
        return ''

    try:
        with open(transcript_path, 'r') as f:
            lines = f.readlines()
    except IOError:
        return ''

    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        if entry.get('type') == 'assistant' and 'model' in entry.get('message', {}):
            return entry['message']['model']

    return ''
