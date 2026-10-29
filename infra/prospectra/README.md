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
