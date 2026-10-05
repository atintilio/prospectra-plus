# Checklist de produção — Prospectra+

- [x] Blob privado exclusivo `prospectra-data` conectado ao projeto Vercel.
- [x] Login, criação de senha, recuperação e logout implementados em funções serverless.
- [x] Office 365 via Microsoft Graph implementado sem fallback simulado.
- [x] Controle de acesso da área de equipes e diagnósticos implementado na interface com sessão real.
- [x] Typecheck, typecheck de API, testes existentes e build Vite aprovados.
- [ ] Inserir no Vercel as variáveis `OFFICE365_TENANT_ID`, `OFFICE365_CLIENT_ID`, `OFFICE365_CLIENT_SECRET`, `OFFICE365_SENDER_EMAIL`, `AUTH_SECRET`, `PUBLIC_APP_URL` e `MASTER_USER_EMAIL`.
- [ ] Conceder `Mail.Send` como permissão Application e admin consent no App Registration.
- [ ] Fazer deployment da branch autenticada e confirmar `GET /api/health` com `status: ok`.
- [ ] Solicitar o primeiro link real em `/recuperar-senha` e confirmar a entrega em `atintilio@argusprime.com.br`.
- [ ] Apontar o DNS de `prospectra.argusprime.com.br` para o deployment Vercel.
- [ ] Só depois liberar a versão para uso da equipe.
