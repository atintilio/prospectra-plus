# Login LinkedIn no Prospectra

O painel fica em Configurações → Integrações. O backend exige sessão ativa e bloqueia a demonstração. O ID do usuário autenticado é transformado em SHA-256; o cliente não escolhe o dono do perfil. Cada usuário tem um volume Docker independente. Não reutiliza o perfil compartilhado anterior.

O gateway inicia um container temporário do MCP 4.26.2 com `--login --login-viewer`. Apenas uma tentativa simultânea é permitida nesta VM. Tokens aleatórios expiram em 30 minutos. A tela é servida via HTTPS, com WebSocket; não requer túnel SSH no computador do usuário. O endpoint de controle exige token privado. O estado `authenticated` significa que o processo de login verificou e salvou a sessão; não significa campanhas ou envios homologados.

Variáveis Vercel opcionais: LINKEDIN_LOGIN_GATEWAY_URL e LINKEDIN_LOGIN_GATEWAY_TOKEN. No deployment existente, o endereço padrão é SCRAPER_BASE_URL + /linkedin-login e a chave é derivada de SCRAPER_API_KEY (fallback SGAI_API_KEY) com HMAC SHA256, contexto `prospectra-linkedin-login-v1`. A chave original não é enviada pelo frontend. Pode-se separar as chaves posteriormente sem alterar o painel.

VM: construir a imagem deste diretório; montar /var/run/docker.sock e volume persistente em /data; definir GATEWAY_TOKEN, PUBLIC_BASE e DOCKER_NETWORK. O gateway tem privilégio de controle Docker, portanto sua API deve ficar protegida pelo token e sua porta sem publicação externa. Caddy encaminha /linkedin-login/* ao gateway removendo o prefixo. Login interrompido/expirado não é marcado como sucesso.

Limitações: a VM E2 Micro continua sendo um gargalo de desempenho. As sessões individuais ainda precisam ser consumidas pelo executor de campanhas; esta alteração cobre autenticação e persistência, não implementa envio LinkedIn.
