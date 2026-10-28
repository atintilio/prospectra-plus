#!/usr/bin/env python3
"""Run a native cal.diy command with the server-only environment file."""

import os
from pathlib import Path
import sys

if len(sys.argv) < 2:
    raise SystemExit('usage: run_env.py command [args...]')

environment = os.environ.copy()
for line in Path('/opt/agenda/.env').read_text().splitlines():
    if not line or line.lstrip().startswith('#') or '=' not in line:
        continue
    key, value = line.split('=', 1)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        value = value[1:-1]
    environment[key] = value

environment.setdefault('NEXT_PUBLIC_LICENSE_CONSENT', 'agree')
environment.setdefault('CALCOM_TELEMETRY_DISABLED', '1')
environment.setdefault('NODE_OPTIONS', '--max-old-space-size=4096')
os.execvpe(sys.argv[1], sys.argv[1:], environment)
