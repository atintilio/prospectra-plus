# Marca oficial do LinkedIn no Prospectra+

> Referência de marca para qualquer tela, componente ou documento que cite LinkedIn.
> Fonte primária: [brand.linkedin.com/downloads](https://brand.linkedin.com/downloads) e
> [brand.linkedin.com/in-logo](https://brand.linkedin.com/in-logo).

## 1. Símbolo e cor

| Item | Valor |
|---|---|
| Cor oficial (azul do "in") | **`#0A66C2`** |
| Símbolo | quadrado de cantos arredondados com o "in" branco (vazado) |
| Asset no repo | `public/linkedin.svg` (vetor, 24×24, `fill="#0A66C2"`) |
| Nome da marca | "LinkedIn" — nunca "Linkedin", "linked in" nem "Linked-IN" |

O SVG do repo é o vetor oficial do símbolo. Ele **já vem com o "in" vazado** (o path do
quadrado e o das letras estão no mesmo traçado, em sentidos opostos) — por isso o branco do
"in" é o próprio fundo, e não um branco desenhado.

## 2. Regras de uso (das diretrizes oficiais)

1. **Não modificar** a cor nem a forma do símbolo. A variation aprovada para fundo claro é o
   azul `#0A66C2`; para fundo escuro, branco ou preto (conforme a diretriz oficial).
2. **Não combinar** o símbolo com outro logo, palavra, slogan ou imagem
   (proibido "Love[in]", "No [in]vesting" etc.).
3. **Não usar** de forma que sugira afiliação, endosso ou patrocínio da LinkedIn.
4. **Tamanho mínimo**: 21px de altura na tela (0,25" / 6,35mm em impressão).
5. Manter **espaço de respiro** ao redor do símbolo, separado dos demais elementos.
6. Preferir **fundo branco** (ou claro, com contraste suficiente).

## 3. Onde o Prospectra usa a marca

| Contexto | Como aparece |
|---|---|
| Tela `/linkedin` (conectar conta) | símbolo à esquerda do título e no botão "Conectar conta" |
| Selo de integração (cards de ambiente, perfil) | símbolo 20px + nome "LinkedIn" |
| Card do piloto (`/automacao`) | símbolo 20px + estado (conectado / desligado / pendente) |
| Estado da fila | símbolo 16px ao lado de itens de LinkedIn |
| Documentação | esta ficha + o asset em `public/linkedin.svg` |

**Componente único de renderização:** `src/components/linkedin-mark.tsx` — não desenhe o
símbolo à mão em outra tela; use o componente. Assim a cor e a forma ficam em um lugar só.

## 4. Texto padrão (o que a tela deve dizer)

| Situação | Texto |
|---|---|
| Não conectado | "Não conectado" + "Conecte sua conta para o agente trabalhar com a sua rede." |
| Conectado | "Conta vinculada" + nome, e-mail e data da conexão |
| Configuração pendente | "Configuração pendente" + "O administrador precisa cadastrar as credenciais do LinkedIn." |
| Indisponível | "Indisponível agora" + "Não conseguimos falar com o LinkedIn. Tente de novo em instantes." |
| Demo | "Conta simulada" + aviso de que nada é enviado de verdade |

## 5. Cores do Prospectra (para o contexto)

| Token | Valor | Uso |
|---|---|---|
| `--accent` | `#155dfc` | ação primária do app |
| `--brand-violet` | `#7655e8` | demonstração / simulação |
| `--brand-dark` | `#08101f` | fundo escuro |

O azul do LinkedIn (`#0A66C2`) **não** substitui o `--accent` do app: ele identifica
**fonte externa**, nunca ação primária. Botões de ação LinkedIn usam o azul da marca;
botões do app continuam no `--accent`.

## 6. Checklist de conformidade

- [ ] O símbolo vem do componente (ou do `public/linkedin.svg`), não de um desenho improvised
- [ ] A cor é `#0A66C2` (ou branco/preto em fundo escuro, conforme a diretriz)
- [ ] Altura mínima de 21px onde for printed; 20px em selo de interface (aceitável para uso em tela)
- [ ] Não está combinado com o logo do Prospectra no mesmo bloco (usar separados, com respiro)
- [ ] O texto diz "LinkedIn" e não implica parceria oficial
