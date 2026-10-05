# Equipes e diagnósticos

## Matriz de acesso

| Papel | Equipes | Negócios | Diagnóstico |
|---|---|---|---|
| Administrador | Todas | Todos | Consolidado e executivo completo |
| Líder | Própria equipe | Todos os negócios da equipe | Somente consolidado |
| Liderado | Própria carteira | Somente negócios próprios | Somente consolidado |

O controle é derivado do papel e do vínculo `teamId` da sessão; a interface não deve ser considerada uma barreira isolada quando o endpoint de dados for conectado.

## Diagnóstico executivo completo

Disponível somente ao administrador. Contém capa executiva, introdução, tese, base legal, memória de cálculo, evidências, premissas e recomendação.

## Diagnóstico consolidado

Disponível dentro das equipes. Mostra a conta, a tese em alto nível, o potencial, a confiança, o estágio e a atualização. Não exibe base legal, memória de cálculo nem evidências detalhadas.

Os dados atuais de equipes e diagnósticos são massa de demonstração da primeira versão. O próximo passo de operação é cadastrar usuários líder/liderado no mesmo armazenamento privado e expor o endpoint server-side filtrado por papel antes de liberar novos usuários.
