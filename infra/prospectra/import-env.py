#!/usr/bin/env python3
"""Merge authorized settings from one JSON stdin line into a protected env file."""
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile


def import_values(path, values):
    if not isinstance(values, dict) or not values:
        raise ValueError('Expected a nonempty object')
    for key, value in values.items():
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key):
            raise ValueError('Invalid setting name')
        if not isinstance(value, str) or any(c in value for c in '\n\r\0'):
            raise ValueError('Settings must be single-line strings')
    previous = path.read_text() if path.exists() else ''
    kept = [line for line in previous.splitlines() if line.partition('=')[0] not in values]
    for key, value in values.items():
        escaped = value.replace('\\', '\\\\').replace('"', '\\"')
        kept.append(f'{key}="{escaped}"')
    if path.exists():
        backup_fd, backup_name = tempfile.mkstemp(prefix='app.env.backup.', dir=path.parent)
        os.close(backup_fd)
        shutil.copyfile(path, backup_name)
        os.chmod(backup_name, 0o600)
    descriptor, temporary = tempfile.mkstemp(prefix='app.env.import.', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w') as output:
            output.write('\n'.join(kept) + '\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f'Imported {len(values)} settings; file mode 600; values hidden.')


if __name__ == '__main__':
    import_values(Path('/etc/prospectra-plus/app.env'), json.loads(sys.stdin.readline()))
