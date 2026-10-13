# LinkedIn por usuário, sem navegador na VM

O botão em **Configurações → Conectar LinkedIn** abre uma janela do próprio LinkedIn. Depois da autorização, o Prospectra identifica o usuário pelo endpoint OpenID Connect `userinfo`, salva somente `sub`, nome, e-mail opcional, foto opcional e data do vínculo em um Blob privado isolado pelo ID do usuário Prospectra. O token de acesso é usado apenas durante o retorno da autorização e não é persistido. Nenhuma senha ou cookie do LinkedIn passa pelo Prospectra.

## Configuração única

1. Criar um aplicativo no [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps) e solicitar o produto **Sign In with LinkedIn using OpenID Connect**.
2. Cadastrar exatamente este Redirect URL no aplicativo: `https://prospectra.argusprime.com.br/api/integrations/linkedin/callback`.
3. Na Vercel, cadastrar `LINKEDIN_OIDC_CLIENT_ID` e `LINKEDIN_OIDC_CLIENT_SECRET` como variáveis de produção protegidas. `AUTH_SECRET`, `PUBLIC_APP_URL` e `BLOB_READ_WRITE_TOKEN` já são dependências existentes da autenticação e persistência do Prospectra.
4. Reimplantar e validar com dois usuários reais distintos: cada um deve ver apenas o próprio nome vinculado; a demo deve bloquear a conexão. Testar cancelamento, fechamento da janela, estado expirado e desconexão.

O `state` da autorização é aleatório, assinado no servidor, vinculado ao usuário e expira em 10 minutos. O cookie é `HttpOnly`, `Secure` em produção e `SameSite=Lax`. O callback consome o estado antes de trocar o código por um token e nunca retorna o código ou token ao front-end.

## Capacidade demonstrada

Esta conexão **identifica a conta LinkedIn do usuário**. Ela não concede acesso a mensagens privadas, convites, caixa de entrada ou contatos. A criação de texto, abertura do perfil e registro de ações permanecem no fluxo assistido. O indicador de canal deve mostrar “Conta vinculada” e “Assistido”, nunca “Envio automático pronto”.

Documentação: [OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) e [permissões disponíveis](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access).

O serviço legado `infra/linkedin-login` não é chamado pela interface nem pelo health check após esta mudança. Ele pode ser desligado na VM depois de confirmar a implantação e o teste real; não desligar o scraper ou o gateway WhatsApp ao removê-lo.
