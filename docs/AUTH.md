# Autenticação de produção

## Fluxo

- `POST /api/auth/request-password` cria um usuário master autorizado, gera um token de uso único com expiração de 15 minutos e envia o link pelo Microsoft Graph.
- `POST /api/auth/set-password` valida o token, grava somente o hash scrypt e abre a sessão.
- `POST /api/auth/login` valida e-mail, hash e status ativo.
- `GET /api/auth/me` resolve a sessão e o papel atual.
- `POST /api/auth/logout` limpa o cookie de sessão.

A sessão usa cookie `prospectra_session`, assinatura HMAC e `SameSite=None; Secure` no ambiente publicado. O armazenamento é um Blob privado exclusivo do projeto Vercel em `prospectra/auth.json`; não usa `localStorage`, não reutiliza o Neon do Reversa e não grava senhas em texto puro.

## Office 365

O envio é server-side via Microsoft Graph `POST /v1.0/users/{sender}/sendMail` usando `client_credentials`. O App Registration deve possuir `Mail.Send` como permissão **Application** com admin consent. Os valores ficam somente nas variáveis protegidas do Vercel:

- `OFFICE365_TENANT_ID`
- `OFFICE365_CLIENT_ID`
- `OFFICE365_CLIENT_SECRET`
- `OFFICE365_SENDER_EMAIL`

## Primeiro acesso

O e-mail master é `MASTER_USER_EMAIL`. Após salvar as variáveis, chamar a tela `/recuperar-senha` ou usar o formulário do login para disparar o convite real. Nenhum link deve ser fabricado ou exibido pela interface; o token só é persistido em hash e enviado pelo Office 365.
