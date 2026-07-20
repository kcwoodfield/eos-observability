#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

"""
EOS-Observability — Claude Code adapter.

Reads a Claude Code hook payload from stdin, wraps it in the normalized
ObservabilityEvent envelope (see apps/server/src/types.ts), and POSTs it to
the EOS-Observability server.

Harness-native fields (`event_type`, `payload`) are preserved verbatim. This
script does no stage/role inference — that's a separate, explicit step (see
send_stage_transition.py).
"""

import json
import sys
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from utils.model_extractor import get_model_from_transcript
from utils.token_usage import get_token_usage_from_transcript


def send_event(event_data: dict, server_url: str) -> bool:
    try:
        req = urllib.request.Request(
            server_url,
            data=json.dumps(event_data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status == 200
    except urllib.error.URLError as e:
        print(f"Failed to send event: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description='Send a Claude Code hook event to EOS-Observability')
    parser.add_argument('--source-app', required=True, help='Role/agent identity for this session')
    parser.add_argument('--event-type', required=True, help='Claude Code hook event name (e.g. PreToolUse)')
    parser.add_argument('--server-url', default='http://localhost:4100/events')
    parser.add_argument('--add-chat', action='store_true', help='Include the full transcript, if available')
    args = parser.parse_args()

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Failed to parse hook input: {e}", file=sys.stderr)
        sys.exit(1)

    session_id = input_data.get('session_id', 'unknown')
    transcript_path = input_data.get('transcript_path', '')

    event_data = {
        'harness': 'claude-code',
        'source_app': args.source_app,
        'session_id': session_id,
        'event_type': args.event_type,
        'payload': input_data,
        'timestamp': int(datetime.now().timestamp() * 1000),
    }

    model_name = get_model_from_transcript(transcript_path)
    if model_name:
        event_data['model_name'] = model_name

    token_usage = get_token_usage_from_transcript(transcript_path)
    if token_usage:
        event_data['token_usage'] = token_usage

    if args.add_chat and transcript_path:
        chat_data = []
        try:
            with open(transcript_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        try:
                            chat_data.append(json.loads(line))
                        except json.JSONDecodeError:
                            pass
            event_data['chat'] = chat_data
        except IOError as e:
            print(f"Failed to read transcript: {e}", file=sys.stderr)

    send_event(event_data, args.server_url)

    # Never block Claude Code on an observability failure.
    sys.exit(0)


if __name__ == '__main__':
    main()
