# Parte 6 — Tela de escolha de ambiente (decisão tomada)

> Data: 02/11/2026. **Decisão do dono: variação A ("Escolha o seu mundo") está no ar.**
> O arquivo ativo é `src/app/ambiente/page.tsx`. As variações B e C foram
> apresentadas, comparadas e **removidas do repositório** depois da escolha.

---

## 1. O que está no ar

`src/app/ambiente/page.tsx` — tela cheia, dividida em dois lado a lado:

- **Produção** em azul escuro (`#123a7a` → `#08152e`), **Demonstração** em violeta
  (`#5b3bc4` → `#221046`).
- Badge **"Você está aqui"** no lado do ambiente da sessão.
- No cabeçalho: logo em branco + o ambiente ativo agora e a operação.
- Cada lado: título do ambiente, nome da operação, frase de apoio, **3 métricas
  reais** (leads, campanhas, reuniões) e os **selos de integração** (WhatsApp,
  LinkedIn e voz).
- Botão branco "Entrar em produção" / "Abrir demonstração". O botão de produção
  é **desabilitado** quando a conta não tem operação vinculada, com a explicação
  embaixo.
- **"Recriar do zero"** só no lado da demonstração, como ação discreta, com
  **trava no servidor**: a server action só roda se o formulário mandar
  `confirmar=sim`; sem isso, redireciona sem apagar nada.
- Rodapé com "Sair".

Os dados vêm de `src/app/ambiente/_ambiente-data.ts` (módulo compartilhado que
continua no repositório): ambiente ativo, operação de cada ambiente, contagens
reais, estado real das integrações e os selos com a marca oficial
(`src/components/whatsapp-mark.tsx` `#25D366`, `src/components/linkedin-mark.tsx`
`#0A66C2`).

**Zero real, nunca número inventado:** quando a operação não existe, a métrica
aparece como 0 e a tela diz "Nenhuma operação vinculada".

---

## 2. Por que a A (e o que ela troca de visual)

A A foi escolhida por ser a mais impactante numa apresentação ao vivo: os dois
ambientes aparecem **lado a lado**, com cor própria, e o dono vê na hora o que
existe em cada um (produção vazia de dados reais × demonstração completa).

O custo da escolha é **visual**: `/ambiente` passa a ser escura e colorida, o que
difere do resto do app (branco). Essa é a única tela do produto com esse
tratamento — e é intencional: ela é a "porta de entrada", não uma tela interna.

Nenhuma outra tela foi tocada. Nenhum CSS global, nenhuma migration, nenhuma
rota de API.

---

## 3. O que não muda

- A escolha do ambiente continua passando pela mesma server action
  (`chooseEnvAction` em `src/app/(app)/actions.ts`).
- A demonstração **não** passa a enviar nada: as integrações continuam simuladas.
- A tela do **menu** e as demais telas **não** são tocadas.
- O gate por operação (`orgs.image_enabled`, `call_enabled`, `linkedin_enabled`)
  não muda: a tela só **mostra** o estado, não libera nada.

---

## 4. O que foi removido (02/11/2026)

- `src/app/ambiente/_variante-a.tsx` — o código foi para dentro de `page.tsx`.
- `src/app/ambiente/_variante-b.tsx` — card único com alternador GET.
- `src/app/ambiente/_variante-c.tsx` — evolução dos dois cards claros.
- `src/app/ambiente-variantes/` — página de conferência temporária (as três
  lado a lado), que existia só para a escolha.

As três permaneceram em `backup/prospectra-plus-2026-10-31` no histórico do
Git, se algum dia for preciso rever a comparação.

---

## 5. Como voltar atrás

A tela antiga (dois cards brancos simples) está no histórico do Git:

```bash
git log --oneline -- src/app/ambiente/page.tsx   # achar o commit anterior
git show <commit-anterior>:src/app/ambiente/page.tsx > src/app/ambiente/page.tsx
```

Depois: typecheck, suíte e release (`prospectra-plus-release <sha>` na VPS).

---

**Fontes:** `src/app/ambiente/page.tsx` (tela ativa),
`src/app/ambiente/_ambiente-data.ts` (dados compartilhados),
`src/app/(app)/actions.ts` (`chooseEnvAction`, `resetDemoAction`),
`src/components/whatsapp-mark.tsx` e `src/components/linkedin-mark.tsx` (selos).
Conferido em 02/11/2026.
