# Parte 6 — Tela de escolha de ambiente (as três variações)

> Data: 01/11/2026. As três variações **não estão no ar**. A tela ativa continua
> `src/app/ambiente/page.tsx` (dois cards simples, sem métricas e sem selos de
> integração). Este guia explica o que cada variação muda, o que cada uma custa e
> **qual arquivo trocar** para ativar a escolhida.

---

## 1. O que existe hoje (a tela ativa)

`src/app/ambiente/page.tsx` — tela branca com dois cards:

- **Produção**: nome da operação (se houver) + botão "Entrar em produção".
- **Demonstração**: botão "Abrir demonstração" + "Recriar do zero" (sem confirmação).

Ela **não** mostra: qual ambiente está ativo agora, quantos leads/campanhas/reuniões
existem em cada ambiente, nem o estado das integrações (WhatsApp, LinkedIn, voz).

---

## 2. O que as três variações têm em comum

Todas as três leem os **mesmos dados reais** do banco, pelo módulo compartilhado
`src/app/ambiente/_ambiente-data.ts`:

- **Ambiente ativo agora** — derivado da sessão (`ctx.org.isDemo`): "Produção",
  "Demonstração" ou "nenhum".
- **Operação de cada ambiente** — em produção, a operação da conta (admin vê a
  primeira; usuário, a sua). Em demo, a operação de demonstração da conta — que
  **ainda pode não existir** (ela nasce quando o usuário entra).
- **Métricas reais**: leads, campanhas, reuniões e equipe (contagem de `memberships`).
  **Zero real** quando a operação não existe — nunca número inventado.
- **Estado real das integrações**: WhatsApp (consulta o WA-AKG com timeout de 4 s),
  LinkedIn (tabela `linkedin_connections` + `orgs.linkedin_enabled` + credenciais) e
  voz (`VOICESTUDIO_ENGINE`, `VOICE_AUTOMATION_ENABLED`, perfil de voz do dono).
- **Selos com a marca oficial**: WhatsApp `#25D366` e LinkedIn `#0A66C2`
  (`src/components/whatsapp-mark.tsx`, `src/components/linkedin-mark.tsx`).
- **Acessibilidade**: `aria-label` nos botões com ícone, foco visível, `role="status"`
  nos selos, layout responsivo.
- **Nada de rede desnecessária**: a consulta ao gateway tem timeout para a tela não
  pendurar se o WA-AKG estiver fora.

---

## 3. As três variações

### Variação A — "Escolha o seu mundo"

**Arquivo:** `src/app/ambiente/_variante-a.tsx`

Tela cheia, dividida em dois lado a lado:

- **Produção** em azul escuro (`#123a7a` → `#08152e`), **Demonstração** em violeta
  (`#5b3bc4` → `#221046`).
- Badge **"Você está aqui"** no lado do ambiente da sessão.
- No cabeçalho: o ambiente ativo agora e a operação (logo + nome).
- Cada lado: título do ambiente, nome da operação, frase de apoio, **3 métricas**
  (leads, campanhas, reuniões) e os **selos de integração**.
- Botão branco "Entrar em produção" / "Abrir demonstração"; o botão de produção é
  **desabilitado** quando a conta não tem operação vinculada, com a explicação
  embaixo.
- Rodapé com "Sair".

**Custo:** baixo. É markup e classes utilitárias do Tailwind já existente; **não**
precisa de CSS global novo.

**Risco:** baixo. O visual é o mais "departamental" dos três — muda o contrato
visual da primeira tela. É a variação que mais chama atenção em demonstração.

---

### Variação B — "Card único com alternador"

**Arquivo:** `src/app/ambiente/_variante-b.tsx`

Um card central só, com alternador **Produção | Demonstração** no topo:

- O alternador é um **formulário GET** (`?env=prod|demo`): a tela troca o conteúdo
  conforme a query. **Funciona sem JavaScript**.
- O conteúdo abaixo é o do ambiente escolhido: nome da operação, métricas e selos.
- **Um botão só**: "Entrar".

**Custo:** o mais barato. Menos markup, menos repetição.

**Risco:** médio-baixo. Perde a comparação lado a lado (é preciso alternar para ver
o outro ambiente) e o estado atual só aparece no card escolhido.

---

### Variação C — "Evolução dos dois cards" (recomendada)

**Arquivo:** `src/app/ambiente/_variante-c.tsx`

Mantém os dois cards da tela atual, mas cada um passa a dizer a verdade:

- Badge **"Você está aqui"** (verde, `success-soft`) no card do ambiente da sessão.
- **4 métricas** por ambiente: leads, campanhas, reuniões e equipe.
- **Selos de integração** (LinkedIn, WhatsApp, voz) com o estado real.
- **"Recriar do zero" só na demonstração**, como ação discreta dentro de um
  `<details>` com **confirmação explícita** no servidor: a ação só roda se o
  formulário mandar `confirmar=sim`; sem isso, redireciona sem apagar nada.
- Botão de produção desabilitado (com explicação) quando a conta não tem operação.

**Custo:** baixo. Continua no visual branco atual — **é a menor mudança visual** e,
por isso, a que menos arrisca brigar com o resto do app.

**Risco:** o mais baixo dos três. O "Recriar do zero" destrutivo ganhou trava no
servidor (não é só um `confirm()` do navegador).

---

## 4. Comparativo

| | **A — Escolha o seu mundo** | **B — Card único** | **C — Evolução dos cards** |
|---|---|---|---|
| Comparação lado a lado | Sim | Não (alterna) | Sim |
| Mostra o ambiente ativo | Sim (topo + badge) | Sim (no card escolhido) | Sim (badge + topo) |
| Métricas por ambiente | 3 | 3 (do escolhido) | 4 |
| Selos de integração | Sim | Sim | Sim |
| Recriar do zero com confirmação | Não | Não | **Sim (trava no servidor)** |
| Funciona sem JavaScript | Sim | **Sim (GET)** | Sim |
| Mudança visual | **Grande** (tela escura colorida) | Média | **Pequena** (mantém o branco) |
| Custo de implementação | Baixo | Baixo | Baixo |
| Risco | Baixo | Médio-baixo | **Baixo** |

**Recomendação:** **C**. É a que entrega a informação nova (estado real + ambiente
ativo) sem mexer na identidade visual da tela — e a única que blinda o
"Recriar do zero" contra clique acidental.

---

## 5. Como ativar a variação escolhida

**Exatamente um arquivo troca.** O resto do app não muda.

### Se escolher a C (recomendado)

```bash
cd /workspace/prospectra-plus
cp src/app/ambiente/_variante-c.tsx src/app/ambiente/page.tsx
```

`_variante-c.tsx` exporta `default async function VarianteC()` — sem props — então
serve como `page.tsx` sem ajuste. Ajustes pequenos esperados:

- `export const metadata = { title: 'Escolha o ambiente' };` (a atual tem isso; a
  variação não repete o metadata).
- Se o `next build` reclamar de metadata faltando, adicionar a linha acima ao topo do
  arquivo.

### Se escolher a A

```bash
cp src/app/ambiente/_variante-a.tsx src/app/ambiente/page.tsx
```

Mesma regra: `default async function VarianteA()`, sem props.

### Se escolher a B

A B recebe o ambiente escolhido pela query, então precisa de uma página que leia o
parâmetro:

```bash
cp src/app/ambiente/_variante-b.tsx src/app/ambiente/page.tsx
```

E o `page.tsx` precisa encaminhar a query:

```tsx
import VarianteB from './_variante-b';
import { requireUser } from '@/lib/auth';

export const metadata = { title: 'Escolha o ambiente' };
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ env?: string }>;
}) {
  await requireUser();
  const { env } = await searchParams;
  return <VarianteB env={env === 'demo' ? 'demo' : env === 'prod' ? 'prod' : undefined} />;
}
```

### Depois de trocar

```bash
pnpm exec tsc --noEmit        # typecheck
pnpm test                     # suíte completa
pnpm build                    # build de produção
```

E, para publicar: `prospectra-plus-release <sha>` na VPS (o script migra, compila,
troca o symlink e valida; se algo falha, ele volta atrás sozinho).

### Depois de ativar

- Remover as duas variações **não escolhidas** (`_variante-a.tsx`, `_variante-b.tsx` e
  `_variante-c.tsx` que sobraram) para não deixar tela morta no repositório.
- Remover a página de conferência temporária (`src/app/ambiente-variantes/`), que
  existe só para conferir as três lado a lado antes da escolha.
- Atualizar `docs/GUIA.md` (o índice) com a parte 6.

---

## 6. O que **não** muda em nenhuma das três

- A escolha do ambiente continua passando pela mesma server action
  (`chooseEnvAction` em `src/app/(app)/actions.ts`).
- A demonstração **não** passa a enviar nada: as integrações continuam simuladas.
- A tela do **menu** e as demais telas **não** são tocadas — a troca é só em
  `/ambiente`.
- Nenhum CSS global, nenhum `globals.css`, nenhuma migration, nenhuma rota de API.

---

**Fontes:** `src/app/ambiente/page.tsx` (tela ativa), `src/app/ambiente/_variante-a.tsx`,
`_variante-b.tsx`, `_variante-c.tsx` e `src/app/ambiente/_ambiente-data.ts`
(dados compartilhados), `src/components/whatsapp-mark.tsx` e
`src/components/linkedin-mark.tsx` (selos). Conferido em 01/11/2026.
