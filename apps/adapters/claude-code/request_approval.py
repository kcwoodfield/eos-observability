#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

"""
EOS-Observability — human-in-the-loop approval request.

Opens a pending request on the server, then blocks (long-polling) until a
human responds from the dashboard's inbox, or the timeout elapses. Meant to
be invoked directly (e.g. by the Engineering Lead role, via the Bash tool)
at a stop-and-escalate point such as an EOS quality gate — it is not a
Claude Code hook, and nothing here decides *when* to ask, only how to ask
and wait.

The human answers only to the Engineering Lead — the server rejects any
--source-app other than "Engineering Lead". A specialist role (Research,
Architecture, Implementation, Review, Testing, Knowledge Steward) reports
its gate outcome to the Engineering Lead, who is the one that checks in
with the human, not the specialist directly.

Connection direction is deliberately inverted from the reference app this
project replaces: this script (the requester) holds the long-lived
connection via repeated long-poll calls, rather than the server dialing an
outbound connection back to an ephemeral, agent-hosted port.
"""

import json
import sys
import time
import argparse
import urllib.request
import urllib.error


def poll_once(base_url: str, request_id: int, chunk_timeout: int) -> dict:
    url = f"{base_url}/hitl/{request_id}/wait?timeout={chunk_timeout * 1000}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=chunk_timeout + 10) as response:
        return json.loads(response.read().decode('utf-8'))


GATES = ['understanding', 'architecture', 'approval', 'review', 'testing', 'knowledge_preservation']


def main():
    parser = argparse.ArgumentParser(description='Ask a human for approval and wait for the answer')
    parser.add_argument(
        '--source-app',
        required=True,
        help='Must be "Engineering Lead" — the server rejects requests from any other role. '
             'Specialist roles report their gate outcome to the Engineering Lead; only it '
             'checks in with the human.',
    )
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--question', required=True, help='What you need approved, in plain language')
    parser.add_argument('--ticket-id', help='Resolution packet ticket ID, if applicable')
    parser.add_argument(
        '--gate',
        choices=GATES,
        help='If this confirms a quality gate, which one — required before send_stage_transition.py '
             'can mark that gate gate_result=pass (server rejects pass without a matching approved '
             'confirmation here).',
    )
    parser.add_argument('--timeout', type=int, default=1800, help='Total seconds to wait (default 30m)')
    parser.add_argument('--server-url', default='http://localhost:4100')
    args = parser.parse_args()

    create_body = {
        'harness': 'claude-code',
        'source_app': args.source_app,
        'session_id': args.session_id,
        'question': args.question,
    }
    if args.ticket_id:
        create_body['ticket_id'] = args.ticket_id
    if args.gate:
        create_body['gate'] = args.gate

    try:
        req = urllib.request.Request(
            f"{args.server_url}/hitl",
            data=json.dumps(create_body).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            created = json.loads(response.read().decode('utf-8'))
    except urllib.error.URLError as e:
        print(f"Failed to create approval request: {e}", file=sys.stderr)
        sys.exit(1)

    request_id = created['id']
    print(f"Waiting for approval (request #{request_id}): {args.question}", file=sys.stderr)

    deadline = time.time() + args.timeout
    current = created

    while current['status'] == 'pending' and time.time() < deadline:
        chunk = min(60, max(1, int(deadline - time.time())))
        try:
            current = poll_once(args.server_url, request_id, chunk)
        except urllib.error.URLError as e:
            print(f"Lost connection while waiting, retrying: {e}", file=sys.stderr)
            time.sleep(2)

    if current['status'] == 'approved':
        print("Approved")
        if current.get('response'):
            print(current['response'])
        sys.exit(0)
    elif current['status'] == 'denied':
        print("Denied")
        if current.get('response'):
            print(current['response'])
        sys.exit(1)
    else:
        print(f"Timed out after {args.timeout}s with no response", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
