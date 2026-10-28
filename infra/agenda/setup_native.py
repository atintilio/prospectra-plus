#!/usr/bin/env python3
"""Prepare an isolated PostgreSQL database for native cal.diy on this VPS."""

from pathlib import Path
import os
import subprocess

env_file = Path('/opt/agenda/.env')
lines = env_file.read_text().splitlines()
values = dict(line.split('=', 1) for line in lines if '=' in line and not line.startswith('#'))
password = values['CALCOM_DB_PASSWORD']


def postgres(sql: str) -> str:
    result = subprocess.run(
        ['runuser', '-u', 'postgres', '--', 'psql', '-Atq', '-v', 'ON_ERROR_STOP=1'],
        input=sql,
        text=True,
        capture_output=True,
        check=True,
    )
    return result.stdout.strip()


if not postgres("SELECT 1 FROM pg_roles WHERE rolname = 'calcom';"):
    postgres("CREATE ROLE calcom LOGIN PASSWORD '" + password.replace("'", "''") + "';")
if not postgres("SELECT 1 FROM pg_database WHERE datname = 'calcom';"):
    postgres('CREATE DATABASE calcom OWNER calcom;')

url = f'postgresql://calcom:{password}@127.0.0.1:5432/calcom'
for key, value in (
    ('DATABASE_URL', url),
    ('DATABASE_DIRECT_URL', url),
    ('DATABASE_HOST', '127.0.0.1'),
    ('NODE_ENV', 'production'),
):
    lines = [line for line in lines if not line.startswith(key + '=')]
    lines.append(f'{key}={value}')
env_file.write_text('\n'.join(lines) + '\n')
env_file.chmod(0o600)
subprocess.run(
    ['psql', '-h', '127.0.0.1', '-U', 'calcom', '-d', 'calcom', '-Atqc', 'SELECT 1'],
    env={**os.environ, 'PGPASSWORD': password},
    capture_output=True,
    text=True,
    check=True,
)
print('native_postgres_prepared')
