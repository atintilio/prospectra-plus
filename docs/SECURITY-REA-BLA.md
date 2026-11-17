# Escudo anti-REA do Prospectra

O Prospectra usa o BLA (`bla-agents` 3.4.3) como camada de proteção dos artefatos compilados contra agentes de engenharia reversa assistida por IA (REA). A licença e o código do BLA são externos; a versão fica fixada no `package.json` e no lockfile.

## Comandos

- `pnpm run security:rea:audit`: auditoria somente leitura do build `.next`.
- `pnpm run security:rea:harden`: gera uma cópia protegida em `.dist/rea-protected` e um manifesto; não sobrescreve o build original.
- `pnpm run security:rea:verify`: verifica o artefato protegido.

## Regra de deploy

O artefato protegido só pode substituir o release depois de passar por build, smoke test e verificação do BLA. O build original deve permanecer disponível para rollback. Não usar `--in-place` no Prospectra sem aprovação explícita.

O escudo reduz exposição de bundles, mapas e artefatos, mas não torna impossível a engenharia reversa de um software que roda no navegador. Segredos, regras sensíveis e chamadas privilegiadas continuam obrigatoriamente no servidor.

## Limite conhecido

O BLA deve ser validado contra o runtime Next.js desta versão antes de entrar no release de produção. A auditoria é segura para executar; o hardening pode alterar artefatos, por isso fica separado do build normal e não é ativado automaticamente neste primeiro passo.
