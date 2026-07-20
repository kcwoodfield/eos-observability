#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# ///

"""
EOS-Observability — explicit lifecycle stage-transition sender.

A deliberate, explicit event marking that a ticket has entered a new eos/
lifecycle stage, carrying the resolution packet ({Application, Ticket ID,
Repository, Project-Memory Path} per
eos/standards/Application Mapping Standard.md). It is not a Claude Code hook —
it's meant to be invoked directly (e.g. by the Engineering Lead role, via the
Bash tool) at each stage boundary in eos/lifecycle/engineering-lifecycle.md.

This script does not infer or validate the stage/role against eos/ — it sends
exactly what it's told. Mapping raw tool activity to a stage automatically is
a separate, unresolved problem; this script only covers the "an explicit
transition was announced" half of it.
"""

import json
import sys
import argparse
import urllib.request
import urllib.error
from datetime import datetime

STAGES = [
    'resolve_application', 'load_project_memory', 'onboard', 'understand',
    'research', 'architecture_review', 'plan', 'approval', 'implement',
    'review', 'testing', 'knowledge_preservation', 'deliver',
]

GATES = ['understanding', 'architecture', 'approval', 'review', 'testing', 'knowledge_preservation']


def main():
    parser = argparse.ArgumentParser(description='Announce an eos/ lifecycle stage transition')
    parser.add_argument('--source-app', required=True, help='Role identity, e.g. "Engineering Lead"')
    parser.add_argument('--session-id', required=True)
    parser.add_argument('--stage', required=True, choices=STAGES)
    parser.add_argument('--role', required=True, help='Owning role for this stage, e.g. "Research"')
    parser.add_argument('--gate', choices=GATES)
    parser.add_argument('--gate-result', choices=['pass', 'fail', 'pending'])
    parser.add_argument('--application', required=True)
    parser.add_argument('--ticket-id', required=True)
    parser.add_argument('--repository', required=True)
    parser.add_argument('--project-memory-path', required=True)
    parser.add_argument('--server-url', default='http://localhost:4100/events/stage-transition')
    args = parser.parse_args()

    lifecycle = {
        'stage': args.stage,
        'role': args.role,
        'resolution_packet': {
            'application': args.application,
            'ticket_id': args.ticket_id,
            'repository': args.repository,
            'project_memory_path': args.project_memory_path,
        },
    }
    if args.gate:
        lifecycle['gate'] = args.gate
    if args.gate_result:
        lifecycle['gate_result'] = args.gate_result

    event_data = {
        'harness': 'claude-code',
        'source_app': args.source_app,
        'session_id': args.session_id,
        'event_type': 'stage_transition',
        'payload': {},
        'timestamp': int(datetime.now().timestamp() * 1000),
        'lifecycle': lifecycle,
    }

    try:
        req = urllib.request.Request(
            args.server_url,
            data=json.dumps(event_data).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status != 200:
                print(f"Server returned status: {response.status}", file=sys.stderr)
                sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Failed to send stage transition: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
