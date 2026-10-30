#!/usr/bin/env python3
"""Hourly fallback tick for Harvey's production recovery and reminders."""

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


def main() -> int:
    base_url = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
    secret = os.environ.get("CRON_SECRET", "")
    parsed_url = urlparse(base_url)
    if (
        not secret
        or parsed_url.scheme != "https"
        or parsed_url.hostname != "prospectra.argusprime.com.br"
        or parsed_url.username
        or parsed_url.password
        or parsed_url.path not in ("", "/")
        or parsed_url.query
        or parsed_url.fragment
        or parsed_url.port not in (None, 443)
    ):
        print("Harvey recovery skipped: required production configuration is unavailable.", file=sys.stderr)
        return 78

    request = Request(
        f"{base_url}/api/harvey/tick",
        headers={"Authorization": f"Bearer {secret}", "Accept": "application/json", "User-Agent": "Prospectra-Recovery/1.0"},
        method="GET",
    )
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, request, file, code, message, headers, new_url):
            return None

    opener = build_opener(ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=50) as response:
            if response.status != 200:
                print(f"Harvey recovery failed: HTTP {response.status}.", file=sys.stderr)
                return 1
            payload = json.loads(response.read(128 * 1024))
            if not isinstance(payload, dict) or not {"inbox", "outbox"}.issubset(payload):
                print("Harvey recovery failed: unexpected response format.", file=sys.stderr)
                return 1
    except HTTPError as error:
        print(f"Harvey recovery failed: HTTP {error.code}.", file=sys.stderr)
        return 1
    except (URLError, TimeoutError, OSError, json.JSONDecodeError) as error:
        print(f"Harvey recovery failed: {type(error).__name__}.", file=sys.stderr)
        return 1

    # Keep response counts and message data out of logs.
    print("Harvey recovery succeeded (HTTP 200; JSON response valid).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
