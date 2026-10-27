"""Executor de pontuação dos dados existentes, sem chamadas externas ou envio de mensagens."""
from __future__ import annotations

import json
import logging
import os
import time
from contextlib import closing
from pathlib import Path
from typing import Any, Protocol

from .scoring import score_profile

logger = logging.getLogger(__name__)


class Store(Protocol):
    def claim(self) -> dict[str, Any] | None: ...
    def finish(self, job: dict[str, Any], result: dict[str, Any] | None) -> None: ...


def run_once(store: Store, stop_file: Path = Path("data/STOP")) -> bool:
    """Processa no máximo uma análise. Interrupção não consome um trabalho."""
    if stop_file.exists():
        return False
    job = store.claim()
    if job is None:
        return False
    try:
        result = score_profile(job["profile"])
        # Não há dados inventados nem status de mensagem enviada neste executor.
        store.finish(job, result)
    except Exception as exc:
        logger.error("Falha na análise: %s", type(exc).__name__)
        store.finish(job, None)
    return True


class PostgresStore:
    """Fila durável no mesmo Postgres do CRM; credenciais nunca entram nos logs."""

    def __init__(self, connection: Any):
        self.connection = connection

    def claim(self) -> dict[str, Any] | None:
        with self.connection, self.connection.cursor() as cursor:
            # Contas bloqueadas, demo, troca de proprietário e opt-out revogam trabalhos.
            cursor.execute("""
                UPDATE intelligence_jobs j SET state='cancelled', result=NULL,
                  error='ACCESS_REVOKED', completed_at=now()
                WHERE j.state IN ('queued','running') AND NOT EXISTS (
                  SELECT 1 FROM leads l JOIN orgs o ON o.id=l.org_id
                    JOIN users u ON u.id=j.user_id
                  WHERE l.id=j.lead_id AND l.org_id=j.org_id AND l.owner_id=j.user_id
                    AND l.stage<>'do_not_contact' AND o.active AND NOT o.is_demo
                    AND u.status='active' AND (u.platform_role='admin' OR EXISTS (
                      SELECT 1 FROM memberships m WHERE m.org_id=j.org_id AND m.user_id=j.user_id)))
            """)
            cursor.execute("""
                UPDATE intelligence_jobs SET state='failed', error='RETRY_EXHAUSTED', completed_at=now()
                WHERE state='running' AND attempts>=3 AND claimed_at<now()-interval '10 minutes'
            """)
            cursor.execute("""
                WITH picked AS (
                  SELECT id FROM intelligence_jobs
                  WHERE (state='queued' OR (state='running' AND claimed_at<now()-interval '10 minutes'))
                    AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
                ) UPDATE intelligence_jobs j SET state='running', attempts=j.attempts+1,
                  claimed_at=now(), error=NULL FROM picked WHERE j.id=picked.id
                  RETURNING j.id, j.org_id, j.user_id, j.lead_id, j.attempts
            """)
            row = cursor.fetchone()
            if row is None:
                return None
            cursor.execute("""
                SELECT full_name AS name, headline AS position, company, linkedin_url
                FROM leads WHERE id=%s AND org_id=%s AND owner_id=%s
            """, (row["lead_id"], row["org_id"], row["user_id"]))
            profile = cursor.fetchone()
            return {**dict(row), "profile": dict(profile or {})}

    def finish(self, job: dict[str, Any], result: dict[str, Any] | None) -> None:
        with self.connection, self.connection.cursor() as cursor:
            cursor.execute("""
                UPDATE intelligence_jobs j SET state=%s, result=%s::jsonb, error=%s,
                  completed_at=now()
                WHERE j.id=%s AND j.org_id=%s AND j.user_id=%s AND j.attempts=%s AND j.state='running'
                  AND EXISTS (
                    SELECT 1 FROM leads l JOIN orgs o ON o.id=l.org_id JOIN users u ON u.id=j.user_id
                    WHERE l.id=j.lead_id AND l.org_id=j.org_id AND l.owner_id=j.user_id
                      AND l.stage<>'do_not_contact' AND o.active AND NOT o.is_demo AND u.status='active'
                      AND (u.platform_role='admin' OR EXISTS (
                        SELECT 1 FROM memberships m WHERE m.org_id=j.org_id AND m.user_id=j.user_id)))
            """, ("completed" if result is not None else "failed",
                  json.dumps(result) if result is not None else None,
                  None if result is not None else "ANALYSIS_FAILED", job["id"], job["org_id"],
                  job["user_id"], job["attempts"]))


def main() -> None:
    """Abre uma conexão por ciclo; reinício recupera somente análises locais idempotentes."""
    import psycopg2
    from psycopg2.extras import RealDictCursor

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url.startswith(("postgresql://", "postgres://")):
        raise RuntimeError("DATABASE_URL Postgres necessária para o executor")
    logging.basicConfig(level=logging.INFO)
    while True:
        try:
            with closing(psycopg2.connect(database_url, connect_timeout=10, cursor_factory=RealDictCursor,
                                        options='-c statement_timeout=15000 -c lock_timeout=5000')) as connection:
                run_once(PostgresStore(connection))
        except Exception as exc:
            logger.error("Executor indisponível: %s", type(exc).__name__)
        time.sleep(5)


if __name__ == "__main__":
    main()
