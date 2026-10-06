# Painel Owner/Master

O **Painel Owner** é a camada de administração do workspace Prospectra+. Ele fica disponível apenas para o usuário autenticado com o papel técnico `admin` — inicialmente, o usuário master `atintilio@argusprime.com.br`.

## O que o Owner administra

| Área | Ação disponível | Persistência |
|---|---|---|
| Usuários | Criar, editar nome/e-mail, ativar/inativar, alterar papel e atribuir liderado a equipe | Blob privado do projeto Vercel |
| Convites | Enviar ou reenviar link de criação de senha | Microsoft Graph / Office 365 |
| Equipes | Criar equipe, nomear líder, escolher cor e incluir liderados | Blob privado do projeto Vercel |
| Segurança | Preservar o usuário master e impedir a remoção de um líder sem reatribuição | Validação server-side |

O formulário de usuário não dispara e-mail sem a escolha explícita **“Enviar convite … agora”**. Depois de criado, cada usuário tem a ação **Enviar convite** ou **Novo link**. Os links expiram em 15 minutos, são de uso único e são enviados pelo remetente configurado no Office 365.

## Papéis e alcance

| Papel técnico | Nome exibido | Escopo comercial | Diagnóstico |
|---|---|---|---|
| `admin` | Owner / Administrador | Todas as equipes e negócios | Consolidado e executivo completo |
| `leader` | Líder | Todos os negócios da equipe atribuída | Somente consolidado |
| `member` | Liderado | Apenas negócios de sua carteira | Somente consolidado |

O painel Owner é escondido da navegação de líderes e liderados e a API `/api/admin/organization` também exige sessão válida de administrador. A interface nunca é a única barreira: a verificação do papel ocorre no servidor contra o armazenamento privado.

## Exceção: Desktop Bridge por usuário

O **Prospectra Abridge não é um recurso exclusivo do Owner**. Todo usuário cadastrado com sessão ativa — Administrador, Líder ou Liderado — pode abrir **Configurações → Desktop Bridge**, criar o próprio dispositivo, copiar o token uma única vez e revogar somente os dispositivos vinculados ao seu usuário. A API valida apenas a sessão ativa e o vínculo do dispositivo; ela não exige o papel `admin`. Um usuário nunca lista, usa ou revoga o dispositivo de outra pessoa.

## Ordem recomendada de operação

1. Cadastre a pessoa com papel **Líder**.
2. Crie a equipe e escolha esse líder.
3. Cadastre os **Liderados** e, se desejar, associe-os à equipe no próprio formulário.
4. No editor de equipes, confira ou ajuste os integrantes.
5. Envie o convite por Office 365 quando a pessoa estiver pronta para ativar seu acesso.

Um líder só pode estar à frente de uma equipe por vez. Para desativar ou rebaixar um líder, primeiro escolha outro líder para a equipe. O usuário master não pode ser desativado nem perder o papel de administrador pelo próprio painel.

## Menu de ações do usuário

No diretório **Acessos e convites**, o botão de três pontos de cada usuário abre as ações administrativas. **Editar usuário** permite alterar nome, e-mail, papel, equipe de liderados e estado ativo. Alterar o e-mail remove a senha anterior e deixa o usuário pronto para receber um novo convite, evitando que a credencial antiga continue vinculada ao endereço anterior.

**Enviar convite** ou **Enviar novo link** gera um token de uso único, expira em 15 minutos e usa o remetente Office 365 configurado. **Desativar acesso** é a exclusão operacional reversível: preserva histórico, retira o usuário da equipe e impede login; o Owner pode reativá-lo depois pelo editor. A exclusão física não é usada porque destruiria a trilha de auditoria e poderia quebrar negócios atribuídos.
