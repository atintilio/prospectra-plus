"""Pontuação heurística explicável; não representa probabilidade de compra."""
from __future__ import annotations
import math
import re
from typing import Any

WEIGHTS = dict(position_seniority=.25, company_size=.20, data_completeness=.20,
               digital_presence=.15, osint_risk=.10, email_validity=.10)


def score_profile(profile: dict[str, Any], osint: dict[str, Any] | None = None) -> dict[str, Any]:
    """Pontua somente os dados fornecidos, sem deduzir contato ou verificação inexistente."""
    if not isinstance(profile, dict) or (osint is not None and not isinstance(osint, dict)):
        raise ValueError('Perfil e dados de fontes devem ser objetos')
    evidence = osint or {}
    role = str(profile.get('position') or '').lower()
    if re.search(r'\b(junior|intern)\b', role): seniority = 30
    elif re.search(r'\b(ceo|founder|cto|cfo|coo|vp|director)\b|\bhead of\b', role): seniority = 100
    elif re.search(r'\b(manager|lead|senior|principal)\b', role): seniority = 70
    else: seniority = 50
    size = profile.get('company_size')
    label = str(size or '').lower()
    digits = re.fullmatch(r'\s*(\d+)\+?\s*', label)
    count = int(digits.group(1)) if digits else 0
    company = 90 if count >= 1000 or label == 'enterprise' else 80 if count >= 100 or label == 'mid' else 60 if label in ('startup','small') else 50
    present = lambda value: isinstance(value, str) and bool(value.strip())
    completeness = sum(present(profile.get(field)) for field in ('name','email','company','position','linkedin_url','phone'))/6*100
    collection = lambda value: isinstance(value,(list,dict)) and bool(value)
    digital = sum(weight for field,weight in (('emails',30),('social_profiles',30),('tech_stack',20),('company_info',20)) if collection(evidence.get(field)))
    risk = evidence.get('risk_score',50)
    try:
        if isinstance(risk,bool): raise ValueError()
        risk = float(risk)
        if not math.isfinite(risk) or not 0 <= risk <= 100: raise ValueError()
    except (ValueError,TypeError):
        raise ValueError('Risco de fonte deve ser finito entre 0 e 100') from None
    factors = dict(position_seniority=seniority,company_size=company,data_completeness=round(completeness,2),
                   digital_presence=digital,osint_risk=100-risk,
                   email_validity=100 if profile.get('email_valid') is True and present(profile.get('email')) else 0)
    score = round(sum(factors[key]*weight for key,weight in WEIGHTS.items()),2)
    priority = 'CRITICAL' if score>=90 else 'HIGH' if score>=75 else 'MEDIUM' if score>=60 else 'LOW'
    return dict(score=score,priority=priority,factors=factors,hot=score>=80)
