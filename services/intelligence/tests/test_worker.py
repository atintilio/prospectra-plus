"""Verifica que análise local não simula envio e respeita interrupção."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from prospectra_intelligence.worker import run_once


class FakeStore:
    def __init__(self):
        self.claimed = 0
        self.results = []

    def claim(self):
        self.claimed += 1
        return {"id": "job", "profile": {"name": "Pessoa", "position": "CEO"}}

    def finish(self, job, result):
        self.results.append(result)


class WorkerTests(unittest.TestCase):
    def test_stop_does_not_claim(self):
        with tempfile.TemporaryDirectory() as directory:
            stop = Path(directory) / "STOP"
            stop.touch()
            store = FakeStore()
            self.assertFalse(run_once(store, stop))
            self.assertEqual(store.claimed, 0)

    def test_result_is_score_not_sent_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            store = FakeStore()
            self.assertTrue(run_once(store, Path(directory) / "STOP"))
            self.assertIn("score", store.results[0])
            self.assertNotIn("sent", store.results[0])

    def test_failure_cannot_become_success_or_automatic_send(self):
        with tempfile.TemporaryDirectory() as directory, patch('prospectra_intelligence.worker.score_profile', side_effect=ValueError('private')):
            store = FakeStore()
            self.assertTrue(run_once(store, Path(directory) / "STOP"))
            self.assertEqual(store.results, [None])
