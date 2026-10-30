# Prospectra na VPS

O aplicativo Next.js roda nativamente na porta privada `127.0.0.1:3100`.
O nginx publica `prospectra.argusprime.com.br`; o DNS usa o endereço HTTP roteado
à VPS, nunca o proxy SSH do provedor por suposição.

## Implantação

1. Extraia um commit da `main` em uma pasta de release em `/opt` e instale as
   dependências com `pnpm install --frozen-lockfile` (pnpm 10.25.0, Node 22).
2. Transfira as configurações reais de produção para
   `/etc/prospectra-plus/app.env`, proprietário root, permissão 600. Valores do
   tipo Secret na Vercel podem não ser recuperáveis; não substitua credenciais
   ou chaves de criptografia existentes por valores novos.
   O código atual não usa `AUTH_SECRET`: as sessões são tokens persistidos no
   banco. O serviço exige `DATABASE_URL` e `CRON_SECRET`, sem gerar outra chave
   para substituir a configuração legada.
3. Confira o banco e faça um backup antes de rodar migrações. O script
   `scripts/migrate.mjs` atual pode apagar schemas se encontrar tabelas centrais
   ausentes. Não execute `pnpm build` contra o banco de produção sem essa
   inspeção. A compilação isolada usa `pnpm exec next build`.
4. Crie o usuário de sistema `prospectra-plus`, permita leitura dos arquivos e
   escrita em `.next/cache`, e aponte `/opt/prospectra-plus-current` para a release.
5. Instale `prospectra-plus.service`, execute `systemctl daemon-reload` e inicie
   o serviço. Valide `/api/health`, `/login` e o login com uma conta existente.
6. Instale o vhost nginx, valide com `nginx -t` e teste com o cabeçalho Host
   antes de alterar o DNS. Preserve o destino anterior para rollback.
7. Troque o DNS somente após a validação. Confira HTTPS, sessão, integrações e
   cron antes de retirar o destino anterior da produção.

## Agendador

Nesta VPS já existe `/etc/cron.d/prospectra-tick`, a cada cinco minutos. Confira
se ele usa o domínio público e se o segredo é o de produção. Não habilite também
`prospectra-plus-cron.timer`, pois isso duplicaria os disparos. Após a troca,
confirme um heartbeat bem-sucedido no aplicativo.

## Diagnóstico

Use `systemctl status prospectra-plus`, `journalctl -u prospectra-plus` e
`curl http://127.0.0.1:3100/api/health`. Credenciais nunca pertencem aos logs ou
ao repositório. A agenda cal.diy é outro serviço, na porta 3102; seu link de
evento precisa existir antes de definir `MEETING_SCHEDULER_URL`.

## Estado verificado em 29/10/2026

- Release da aplicação: `a84c904`, em `/opt/prospectra-plus-release-a84c904`,
  acessível pelo link `/opt/prospectra-plus-current`.
- Build, TypeScript e geração de páginas concluídos. Serviço `prospectra-plus`
  ativo e habilitado; `/login` e `/api/health` retornam 200 na porta 3100.
- A conexão foi recuperada pelo painel oficial do banco ligado à produção.
  As 21 migrações já estavam aplicadas; nenhum schema foi recriado.
- Snapshot consistente dos dados salvo em `/var/backups/prospectra-plus`,
  com permissão 600. São 35 tabelas e 23 registros, incluindo o ledger e os dois
  usuários existentes. `backup-data.mjs` repete a leitura sem alterar o banco;
  o schema é reconstituído pelas migrações da release correspondente.
- `import-env.py` recebe um objeto JSON por stdin, valida nomes e valores,
  preserva campos não fornecidos, cria backup e grava o arquivo com permissão
  600. Nunca envie segredos em argumentos, logs ou no repositório.
- Gateway WhatsApp e saúde da voz retornaram 200. A chave Z.AI fornecida pelo
  proprietário foi configurada, mas o teste retornou 429, código 1113,
  indicando saldo ou pacote de recursos insuficiente.
- Microsoft 365: credenciais originais ainda precisam ser recuperadas ou
  renovadas na origem. As variáveis Secret da Vercel não permitem leitura.
- O domínio continua apontando para a Vercel até validar as integrações e o
  login. Observe o próximo cron existente após a troca, sem disparar um segundo
  agendador manualmente.
