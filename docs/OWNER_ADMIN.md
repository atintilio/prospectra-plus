# Painel Owner/Master

O **Painel Owner** é a camada de administração do workspace Prospectra+. Ele fica disponível apenas para o usuário autenticado com o papel técnico `admin` — inicialmente, o usuário master `atintilio@argusprime.com.br`.

## O que o Owner administra

| Área | Ação disponível | Persistência |
|---|---|---|
| Usuários | Criar, ativar/inativar e alterar o papel | Blob privado do projeto Vercel |
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

## Ordem recomendada de operação

1. Cadastre a pessoa com papel **Líder**.
2. Crie a equipe e escolha esse líder.
3. Cadastre os **Liderados** e, se desejar, associe-os à equipe no próprio formulário.
4. No editor de equipes, confira ou ajuste os integrantes.
5. Envie o convite por Office 365 quando a pessoa estiver pronta para ativar seu acesso.

Um líder só pode estar à frente de uma equipe por vez. Para desativar ou rebaixar um líder, primeiro escolha outro líder para a equipe. O usuário master não pode ser desativado nem perder o papel de administrador pelo próprio painel.
