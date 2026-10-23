# Decisões do proprietário — Prospectra

Confirmadas por André em 23/10/2026.

- O nome e a identidade são Prospectra, sem rótulos de versão na interface.
- Atualizações do banco devem migrar conjuntamente todos os usuários ativos, preservando credenciais, papéis, vínculos e dados. A migração não pode depender do próximo login.
- Contas canceladas, bloqueadas ou removidas por André ou Moisés não podem ser reativadas pela migração.
- Produção e demonstração permanecem separadas.
- André (atintilio@argusprime.com.br) é o administrador master protegido.
- Moisés (mloro@argusprime.com.br) tem as mesmas funções administrativas, exceto excluir/bloquear/rebaixar André a conta master. Pode excluir dados; cada exclusão deve gerar relatório automático reservado ao e-mail de André, sem confirmação do Moisés. As restrições devem existir no backend.
- Cada funcionalidade concluída deve ser validada e salva no GitHub, com pendências e instruções de continuidade.
- Prioridade atual: restaurar gestão de usuários e permissões, retirar diagnóstico de versões da interface e restaurar logo estático. Não alterar a arquitetura nem implementar Harvey/canais durante essa recuperação.
