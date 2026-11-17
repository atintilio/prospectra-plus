# Argus OSINT worker

Worker mínimo e sem credenciais: consulta páginas HTTP públicas e DNS, com timeout, retry, deduplicação, correlação de conflitos e resultado parcial. Adapters recebem `InvestigationTarget` e devolvem apenas `Evidence`; não escrevem no Prospectra.

Uso: `runInvestigation({ id, target })`. O alvo é normalizado antes da coleta; URLs com credenciais, cookies ou parâmetros são rejeitadas. O worker não faz scraping agressivo, não usa tokens e limita o corpo HTTP a 5 KB.
