# Ambiente de demonstração — do começo ao fim

A demonstração do Prospectra é um **caso fictício completo**: uma consultoria de
contadores (Atlas Consultoria) que vende diagnóstico e recuperação de crédito
tributário para indústrias do Sul do país.

Nada ali é real: não sai e-mail, não manda WhatsApp, não chama IA, não toca o
LinkedIn. Tudo já está gravado no banco, pronto para mostrar.

---

## Como entrar

1. Faça login em `https://prospectra.argusprime.com.br/login`
2. Na tela **“Onde você quer entrar?”** escolha **Demonstração**
3. (Opcional) Use **“Recriar do zero”** na mesma tela para voltar a demo ao estado
   inicial — útil antes de apresentar a um parceiro novo.

A demonstração tem empresa, equipe (4 pessoas), 24 leads, campanhas, agenda,
suporte, inteligência comercial e voz — cada aba com conteúdo.

---

## O roteiro (15 minutos)

### 1. Painel — a operação em uma tela
`/painel`
KPIs dos últimos 60 dias, curva de atividade, ranking da equipe e os últimos
acontecimentos ligados a leads reais da demo. Serve para abrir a conversa:
> “Aqui já está a operação rodando: 24 leads, 2 campanhas ativas, fila do dia.”

### 2. CRM e a fila do dia
`/leads` e `/fila`
- Leads em todos os estágios (novo, convidado, conectado, respondeu, reunião,
  ganho, perdido).
- A fila mostra as ações pendentes do dia: curtidas, convites e mensagens.
  O corpo da mensagem já vem preenchido com o nome do lead e a empresa.

> “O time não vai no LinkedIn caçar o que fazer: a fila diz o que fazer, e o
>  atendente só revisa e envia.”

### 3. Campanhas — o roteiro de cadência
`/campanhas`
Duas campanhas ativas (CFOs da indústria e parcerias com escritórios de
contabilidade) e uma encerrada. Cada uma mostra os passos, o atraso entre eles
e o brief de IA que guia a redação.

### 4. Agenda nativa — do link público à reserva
`/agenda` (interna) e `https://agenda.argusprime.com.br/agendamento` (pública)
- Dois tipos de reunião: **Diagnóstico tributário (30 min)** e **Reunião de
  fechamento (45 min)**.
- Disponibilidade semanal de segunda a sábado, em dois blocos.
- Links rastreados (um veio de WhatsApp, um de link direto).
- Reservas: uma confirmada, uma aguardando aprovação, uma cancelada — e um
  bloqueio de calendário (feriado/congresso).
- O lembrete automático e o aviso ao vendedor já ficam registrados.

> “O lead escolhe o horário sozinho, entra no CRM e o vendedor recebe o aviso.
>  Sem double booking — o banco trava a agenda.”

### 5. Atendimento (Helpin) — suporte com SLA
`/atendimento`, `/ajuda`, `/suporte`
- Conversas de web, WhatsApp e internas, com etiquetas.
- Uma conversa **em risco de SLA** e outra **com SLA violado**.
- Duas conversas fechadas com **CSAT 5** e **CSAT 3** (com comentário).
- Horário de atendimento, pré-chat, times de atendimento, artigos de ajuda e
  tarefas de follow-up.

> “O suporte tem SLA, Satisfação e time — não é uma caixa de e-mail.”

### 6. Inteligência comercial — quem atacar primeiro
`/inteligencia`
Três análises prontas: duas concluídas (com score, prioridade e os seis fatores:
cargo, porte, completude dos dados, presença digital, risco de dado falso e
validade do e-mail) e uma na fila. Cada job aponta para um lead real da demo.

> “Antes de mandar a mensagem, o sistema diz quem tem condição de comprar.
>  Roda no cron da madrugada — ninguém precisa apertar botão.”

### 7. Operação comercial (Harvey) — o vendedor com apoio
`/comunicacao` e a aba do Harvey
- Perfil comercial da Atlas (nome, estratégia, ofertas de crédito tributário).
- Perfis de comunicação dos leads (estilo DISC de cada decisor).
- Conversas do Harvey: uma ativa, uma transferida para o humano com resumo.
- Uma mensagem do cliente esperando conferência e uma na caixa do vendedor.

> “O Harvey qualifica, responde o que é repetitivo e passa pro humano o que
>  exige negociação.”

### 8. Voz
`/voz`
Perfil de voz pronto, um envio concluído e um job na fila. A demo só mostra o
estado — a geração real de áudio é feita pelo Voice Studio.

### 9. Relatórios, equipe e conta
`/relatorios`, `/equipe`, `/conta`
Consolidado de performance, ranking da equipe e Preferências.

---

## Como a demo é montada (para quem for mexer)

| Peça | Arquivo |
| --- | --- |
| Orquestrador (CRM + campanhas + fila + eventos) | `src/lib/demo.ts` |
| Agenda e voz | `src/lib/demo-agenda.ts`, `src/lib/demo-voice.ts` |
| Suporte/Helpin | `src/lib/demo-support.ts` |
| Inteligência, Harvey, automações | `src/lib/demo-intel.ts` |
| Recriar do zero | `src/lib/demo-reset.ts` (ação `resetDemoAction`) |
| Botão na tela de ambiente | `src/app/ambiente/page.tsx` |

Regras que os seeds respeitam:

- **Nada de rede**: o seed só grava dados fictícios já prontos.
- **Idempotente**: rodar de novo não duplica nada.
- **Isolada**: só toca a operação com `is_demo = true`. A produção nunca é
  alcançada por esses módulos.
- **Determinístico**: o mesmo seed gera sempre o mesmo cenário (gerador com
  semente fixa), então a demo é sempre igual.

Testes: `tests/demo-agenda.test.ts`, `tests/demo-voice.test.ts`,
`tests/demo-support.test.ts`, `tests/demo-intel.test.ts`.
