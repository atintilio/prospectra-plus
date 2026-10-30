#!/usr/bin/python3
import os
import sys
import urllib.error
import urllib.request

secret = os.environ.get("CRON_SECRET", "")
if not secret:
    print("cron trigger skipped: CRON_SECRET is not configured", file=sys.stderr)
    sys.exit(78)

request = urllib.request.Request(
    "http://127.0.0.1:3100/api/cron",
    headers={"Authorization": f"Bearer {secret}"},
    method="GET",
)
try:
    with urllib.request.urlopen(request, timeout=55) as response:
        if response.status < 200 or response.status >= 300:
            print(f"cron trigger returned HTTP {response.status}", file=sys.stderr)
            sys.exit(1)
except urllib.error.HTTPError as error:
    print(f"cron trigger returned HTTP {error.code}", file=sys.stderr)
    sys.exit(1)
except Exception as error:
    print(f"cron trigger failed: {type(error).__name__}", file=sys.stderr)
    sys.exit(1)
