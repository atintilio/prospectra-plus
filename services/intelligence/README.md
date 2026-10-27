# Inteligência do Prospectra+

Incremento integrado ao CRM existente. A marca e os logins são preservados. A especificação de origem chama-se PROSPECTRA-X v1.1; esse nome não é usado como nome do produto.

## Disponível neste incremento

- Análise heurística parcial e explicável dos dados **já cadastrados** no lead. O cadastro atual não contém porte, contato verificado ou evidências OSINT: esses fatores aparecem como indisponíveis e a prioridade comercial não é classificada. A fórmula completa permanece testada para a futura integração de fontes. Não confirma intenção de compra nem inventa e-mail, telefone ou dados de funcionários.
- Fila Postgres durável, idempotência por solicitação, isolamento por operação/vendedor, limite de 100 análises por vendedor/dia UTC.
- Worker Python com retomada de análises interrompidas após dez minutos e até três aquisições. Contas revogadas, demo, opt-out e transferência de proprietário cancelam o processamento. Resultado só é salvo se o acesso continuar válido.
- Interface integrada em Inteligência comercial; permanece desabilitada até a instalação e verificação do executor.
- SafetyGuard independente para a próxima integração de ações externas: não se deve interpretar esses limites como garantia de evitar bloqueios de terceiros.

Não há envio LinkedIn, navegador headless, campanha automática, cobrança de IA ou substituição de WhatsApp neste executor. Os conectores opcionais não autorizam enriquecimento pago e não são execução de outreach.

## Teste local, sem rede nem credenciais

```sh
cd services/intelligence
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

Os testes do CRM aplicam a migração aditiva em Postgres local PGlite e verificam os limites de acesso. Os testes Python usam dados sintéticos e não demonstram uma sessão real de LinkedIn.

## Instalação na VPS existente

1. Verifique o acesso, memória e disco. Preserve os serviços existentes. Nunca execute `init.sql` do anexo sobre o CRM atual.
2. Publique o código e a migração `0005_intelligence_jobs` pelo fluxo normal do Prospectra+; isso não apaga nem altera o cadastro dos usuários.
3. Copie este diretório para a VPS. Crie `.env` fora do Git, com permissão 600 e `DATABASE_URL` apontando ao mesmo banco do CRM (TLS em produção). Prefira credencial com privilégios mínimos nas tabelas necessárias.
4. Crie `data/` e valide `docker compose config --quiet`. Construa e execute o serviço se Docker estiver disponível na VPS; a imagem não publica portas. Alternativamente, instale Python 3.10+ e as dependências em ambiente virtual e rode `python -m prospectra_intelligence.worker` com diretório de trabalho nesta pasta e reinício via systemd.
5. Verifique logs sem imprimir `.env`. Teste um lead sintético em produção numa operação autorizada, confirme resultado e isolamento, depois configure `INTELLIGENCE_WORKER_ENABLED=true` na aplicação. Não habilite a opção antes dessa validação.
6. `touch data/STOP` pausa novas aquisições de análises. Remover o arquivo retoma. Parar o serviço também interrompe o processamento; trabalhos em execução serão retomados pela lease.

O pipeline completo de descoberta/enriquecimento externo e outreach permanece outra etapa. Redis não é necessário para esta fila durável inicial; não há assinatura ou serviço adicional a contratar.

## Estado da infraestrutura

27/10/2026: a implantação na VPS está bloqueada por indisponibilidade do SSH/painel do provedor. Nenhum teste local equivale a instalação, pareamento WhatsApp ou envio externo real.
