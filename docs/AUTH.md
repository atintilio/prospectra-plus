# Autenticação do Prospectra+

## Fluxo do usuário master

O endereço autorizado é `atintilio@argusprime.com.br`. A primeira solicitação em `/recuperar-senha` cria o registro master sem senha, grava um token somente em hash e envia um link para `/definir-senha?token=...`. O token expira em 15 minutos e só pode ser usado uma vez. Depois da definição, a sessão é um cookie `HttpOnly`, `SameSite=None; Secure` no domínio público e assinado com `AUTH_SECRET`.

## Endpoints

- `POST /api/auth/request-password` — cria ou substitui o token de recuperação do master e dispara o e-mail;
- `POST /api/auth/set-password` — valida token, aplica hash scrypt, invalida tokens anteriores e abre a sessão;
- `POST /api/auth/login` — valida e-mail e senha;
- `GET /api/auth/me` — valida a sessão e resolve o usuário no banco;
- `POST /api/auth/logout` — revoga o cookie do navegador;
- `GET /api/health` — mostra apenas presença/configuração dos recursos, nunca valores.

A resposta de solicitação de recuperação é indistinguível para e-mails não autorizados. O banco guarda somente hash de senha e hash de token; o token em texto nunca é persistido.

## Configuração necessária no Vercel

`DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_APP_URL`, `MASTER_USER_EMAIL`, `EMAIL_API_KEY` e `EMAIL_FROM`. O e-mail usa um endpoint REST compatível com Resend por padrão. A configuração não deve ser commitada no GitHub nem enviada por chat.

Enquanto esses recursos não estiverem configurados, o login fica bloqueado com a mensagem de configuração necessária; não há usuário fictício ou bypass de desenvolvimento.
