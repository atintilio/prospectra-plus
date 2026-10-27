import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from prospectra_intelligence.scoring import score_profile, WEIGHTS
from prospectra_intelligence.safety import SafetyGuard, SafetyError


class Budget:
    def __init__(self): self.counts = {}
    def reserve(self, key, limit):
        value = self.counts.get(key, 0)
        if value >= limit: return False
        self.counts[key] = value + 1
        return True


class ScoringTests(unittest.TestCase):
    def test_factors_weight_and_evidence(self):
        self.assertAlmostEqual(sum(WEIGHTS.values()), 1)
        profile = dict(name='Pessoa', email='p@example.test', company='Empresa', position='CEO', linkedin_url='https://linkedin.com/in/p', phone='5511999999999', company_size=1000, email_valid=True)
        result = score_profile(profile, dict(emails=['p@example.test'], social_profiles=['url'], tech_stack=['python'], company_info={'name':'Empresa'}, risk_score=0))
        self.assertEqual(result['score'], 98)
        self.assertEqual(result['priority'], 'CRITICAL')
        self.assertTrue(result['hot'])
        self.assertEqual(result['factors']['data_completeness'], 100)

    def test_role_matching_and_missing_data_do_not_invent_evidence(self):
        result = score_profile({'position':'director'})
        self.assertEqual(result['factors']['position_seniority'], 100)
        self.assertEqual(result['factors']['email_validity'], 0)
        self.assertEqual(result['factors']['digital_presence'], 0)
        self.assertFalse(result['hot'])
        self.assertEqual(score_profile({'position':'contractor'})['factors']['position_seniority'], 50)
        self.assertEqual(score_profile({'position':'senior manager'})['factors']['position_seniority'], 70)
        self.assertEqual(score_profile({'email_valid':1})['factors']['email_validity'], 0)

    def test_nonfinite_and_invalid_risk_fail_closed(self):
        for value in [float('nan'), float('inf'), -1, 101, 'garbage', True]:
            with self.assertRaises(ValueError): score_profile({}, {'risk_score':value})


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.stop = Path(self.directory.name)/'STOP'
        self.budget = Budget()
        self.now = datetime(2026,10,27,12,tzinfo=timezone.utc) # 09:00 São Paulo
        self.guard = SafetyGuard('org-a','user-a',self.budget,stop_file=self.stop,dry_run=False,warmup_mode=False)
    def tearDown(self): self.directory.cleanup()

    def test_window_stop_and_atomic_limit(self):
        for _ in range(15): self.guard.reserve_action('invite', self.now)
        with self.assertRaises(SafetyError): self.guard.reserve_action('invite',self.now)
        self.assertEqual(next(iter(self.budget.counts.values())),15)
        with self.assertRaises(SafetyError): self.guard.reserve_action('message',self.now.replace(hour=21))
        self.stop.touch()
        with self.assertRaises(SafetyError): self.guard.reserve_action('message',self.now)

    def test_scope_day_warmup_and_simulation_are_separate(self):
        other = SafetyGuard('org-b','user-a',self.budget,stop_file=self.stop,dry_run=False,activated_at=self.now-timedelta(days=1))
        for _ in range(7): other.reserve_action('invite',self.now)
        with self.assertRaises(SafetyError): other.reserve_action('invite',self.now)
        other.reserve_action('invite',self.now+timedelta(days=14))
        self.guard.reserve_action('invite',self.now)
        simulation = SafetyGuard('org-a','user-a',self.budget,stop_file=self.stop)
        before = self.budget.counts.copy()
        self.assertTrue(simulation.reserve_action('invite',self.now)['simulated'])
        self.assertEqual(before,self.budget.counts)

    def test_naive_time_and_invalid_configuration_fail(self):
        with self.assertRaises(ValueError): self.guard.reserve_action('invite',datetime(2026,10,27,9))
        with self.assertRaises(ValueError): self.guard.reserve_action('unsupported',self.now)
        with self.assertRaises(ValueError): SafetyGuard('org:a','user',self.budget)
        with self.assertRaises(ValueError): SafetyGuard('org','user',self.budget,min_delay=120,max_delay=45)

    def test_real_execution_requires_known_warmup_start(self):
        guard=SafetyGuard('org','user',self.budget,stop_file=self.stop,dry_run=False)
        with self.assertRaises(SafetyError): guard.reserve_action('invite',self.now)
        self.assertEqual(self.budget.counts,{})
