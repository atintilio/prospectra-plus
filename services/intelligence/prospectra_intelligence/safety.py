"""Restrições de execução; não há promessa de evitar restrições de plataformas."""
from __future__ import annotations
from datetime import datetime,timedelta,timezone
from pathlib import Path
from random import SystemRandom
from typing import Any,Protocol
from zoneinfo import ZoneInfo
import re

LIMITS = dict(invite=15,message=30,comment=37,view=100,endorse=20)


class SafetyError(RuntimeError):
    """A ação não pode ser executada neste momento."""


class BudgetStore(Protocol):
    def reserve(self,key:str,limit:int)->bool: ...


class RedisBudget:
    """Reserva atômica; nunca separar leitura do contador e incremento."""
    SCRIPT = """
      local current = tonumber(redis.call('GET',KEYS[1]) or '0')
      local limit = tonumber(ARGV[1])
      if not current or current >= limit then return 0 end
      local count = redis.call('INCR',KEYS[1])
      if count == 1 then redis.call('EXPIRE',KEYS[1],172800) end
      return 1
    """
    def __init__(self,client:Any): self.client=client
    def reserve(self,key:str,limit:int)->bool:
        return self.client.eval(self.SCRIPT,1,key,limit)==1


class SafetyGuard:
    def __init__(self,org_id:str,user_id:str,store:BudgetStore,*,stop_file:Path=Path('data/STOP'),
                 tz:str='America/Sao_Paulo',warmup_mode:bool=True,activated_at:datetime|None=None,
                 dry_run:bool=True,min_delay:int=45,max_delay:int=120):
        if not all(isinstance(s,str) and re.fullmatch(r'[A-Za-z0-9_-]{1,100}',s) for s in (org_id,user_id)):
            raise ValueError('Operação e vendedor válidos são obrigatórios')
        if min_delay<0 or max_delay<min_delay: raise ValueError('Intervalo inválido')
        if activated_at is not None and activated_at.utcoffset() is None: raise ValueError('Ativação exige fuso')
        self.scope=f'{org_id}:{user_id}'
        self.store,self.stop_file,self.zone=store,stop_file,ZoneInfo(tz)
        self.warmup_mode,self.activated_at,self.dry_run=warmup_mode,activated_at,dry_run
        self.min_delay,self.max_delay=min_delay,max_delay

    def assert_active_window(self,now:datetime|None=None)->datetime:
        current=now or datetime.now(timezone.utc)
        if current.utcoffset() is None: raise ValueError('Data exige fuso')
        local=current.astimezone(self.zone)
        if self.stop_file.exists(): raise SafetyError('Execução interrompida pelo responsável')
        if not 8<=local.hour<18: raise SafetyError('Fora da janela de execução')
        return local

    def human_delay(self)->float:
        """Retorna intervalo para o executor agendar, sem bloquear a requisição web."""
        return SystemRandom().uniform(self.min_delay,self.max_delay)

    def reserve_action(self,action:str,now:datetime|None=None)->dict[str,Any]:
        """Valida e reserva orçamento antes do envio. Simulação não consome envio real."""
        if action not in LIMITS: raise ValueError('Tipo de ação inválido')
        current=self.assert_active_window(now)
        limit=LIMITS[action]
        if self.activated_at is not None:
            age=current.astimezone(timezone.utc)-self.activated_at.astimezone(timezone.utc)
            if age<timedelta(0): raise ValueError('Ativação futura inválida')
            if self.warmup_mode and age<timedelta(days=14): limit//=2
        if not self.dry_run:
            key=f'guard:{self.scope}:{action}:{current.date().isoformat()}'
            if not self.store.reserve(key,limit): raise SafetyError('Limite diário atingido')
        return dict(simulated=self.dry_run,delay_seconds=self.human_delay(),limit=limit)
