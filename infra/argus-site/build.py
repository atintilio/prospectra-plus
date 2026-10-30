# Gera as páginas estáticas do site Argus Prime (cabeçalho, menu e rodapé compartilhados).
import os, sys
OUT = sys.argv[1]
WA = "https://wa.me/5511962052987?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20com%20a%20Argus%20Prime."
LI = "https://www.linkedin.com/company/argusprime"
ARR = '<span class="arr" aria-hidden="true">→</span>'
OUTL = '<span aria-hidden="true">↗</span>'

def head(title, desc, path):
    url = "https://argusprime.com.br/" + ("" if path == "index" else path)
    return f'''<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta name="theme-color" content="#FBFAF7">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://argusprime.com.br/assets/img/olho-digital.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="icon" href="assets/img/favicon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="assets/css/site.css">
<script>document.documentElement.classList.add("js")</script>
</head>
<body>
'''

NAV = [("sobre", "Sobre"), ("servicos", "Soluções"), ("cases", "Cases"), ("equipe", "Equipe"), ("insights", "Insights")]

def header(cur):
    links = "".join(f'<a href="{p}.html"{" aria-current=\"page\"" if p == cur else ""}>{n}</a>' for p, n in NAV)
    ccur = ' aria-current="page"' if cur == "contato" else ""
    menu = "".join(f'<a href="{p}.html">{n}</a>' for p, n in [("index", "Início")] + NAV + [("contato", "Contato")])
    return f'''<a class="skip" href="#conteudo">Pular para o conteúdo</a>
<div class="topline" aria-hidden="true"></div>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="index.html" aria-label="Argus Prime, início">
      <img class="sym" src="assets/img/argus-prime-simbolo.png" alt="" width="180" height="200">
      <img class="word" src="assets/img/argus-prime-wordmark.png" alt="Argus Prime" width="640" height="118">
    </a>
    <nav class="nav" aria-label="Principal">
      {links}
      <span class="sep" aria-hidden="true"></span>
      <a href="contato.html"{ccur}>Contato</a>
      <a class="btn-out" href="contato.html">Diagnóstico {OUTL}</a>
    </nav>
    <button class="nav-toggle" type="button" data-menu-open aria-expanded="false" aria-controls="menu">Menu
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 8h16M4 16h16"/></svg>
    </button>
  </div>
</header>
<nav class="menu" id="menu" aria-label="Menu" aria-hidden="true" data-open="false">
  <button class="menu-close" type="button" data-menu-close>Fechar</button>
  {menu}
</nav>
'''

def eyebox(cls=""):
    return f'''<div class="eye-box {cls}" data-eye-mini>
        <canvas aria-hidden="true"></canvas>
        <img class="eye-fallback" src="assets/img/olho-digital.webp" alt="" width="1056" height="1408">
      </div>'''

def page_hero(h1, lead, extra=""):
    return f'''<section class="page-hero">
  <div class="wrap ph-grid">
    <div class="ph-copy">
      <h1 class="display split-words">{h1}</h1>
      <p class="lead">{lead}</p>
      {extra}
    </div>
    {eyebox()}
  </div>
</section>
'''

def cta(h2, p, eye=True):
    return f'''<section class="sec cta-final">
  <div class="wrap cta-grid">
    <div class="head rv" style="margin-bottom:0">
      <h2 class="h2">{h2}</h2>
      <p class="lead">{p}</p>
      <a class="btn btn-light" href="contato.html" style="align-self:flex-start">Mapear Oportunidades da Operação {ARR}</a>
    </div>
    {eyebox() if eye else ""}
  </div>
</section>
'''

def footer():
    links = "".join(f'<a href="{p}.html">{n}</a>' for p, n in NAV + [("contato", "Contato")])
    return f'''<footer class="site-footer">
  <div class="wrap">
    <div class="ft-top">
      <div class="ft-brand">
        <img class="sym" src="assets/img/argus-prime-simbolo.png" alt="" width="180" height="200">
        <img class="word" src="assets/img/argus-prime-wordmark.png" alt="Argus Prime" width="640" height="118">
        <p>Engenharia financeira e tributária para empresas que operam em ambiente de alta exigência.</p>
      </div>
      <div><h4>Navegação</h4>{links}</div>
      <div><h4>Contato</h4>
        <span class="line-item">contato@argusprime.com.br</span>
        <a href="{WA}" target="_blank" rel="noopener">WhatsApp (11) 96205-2987 {OUTL}</a>
        <a href="{LI}" target="_blank" rel="noopener">LinkedIn {OUTL}</a>
      </div>
    </div>
    <div class="ft-bottom">
      <span>© <span data-year>2026</span> Argus Prime. Engenharia financeira e tributária.</span>
      <span>Informações tratadas com confidencialidade.</span>
    </div>
  </div>
</footer>
<a class="whats" href="{WA}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.7 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/></svg>
</a>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="assets/js/argus-eye.js"></script>
<script src="assets/js/site.js"></script>
</body>
</html>
'''

def page(name, title, desc, body, cur=None):
    html = head(title, desc, name) + header(cur if cur is not None else name) + '<main id="conteudo">\n' + body + '</main>\n' + footer()
    open(os.path.join(OUT, name + ".html"), "w", encoding="utf-8").write(html)

# ---------------------------------------------------------------- HOME
steps = [
  ("Rigor técnico e jurídico.", "Aderente à operação. Sem promessas vazias.", ""),
  ("Uma operação gera milhares de dados.", "Soltos, eles não decidem nada.", ""),
  ("Conectamos cada dado a uma única leitura de negócio.", "Financeiro, fiscal e societário lidos juntos, sem pontos cegos.", ""),
  ("Três frentes. Um mesmo raciocínio.", "Engenharia financeira, engenharia tributária e estratégia societária. Cada frente pode ser contratada em separado; o ganho aparece quando as três são lidas em conjunto.", ""),
  ("Enxergar a operação inteira antes de decidir.", "O diagnóstico aponta onde há oportunidade, risco ou retrabalho, com a base técnica de cada conclusão.", f'<a class="btn btn-light" href="contato.html">Mapear Oportunidades da Operação {ARR}</a>'),
]
step_html = "".join(f'<div class="cine-step"><h2>{h}</h2><p>{p}</p>{x}</div>' for h, p, x in steps)
seq_static = "".join(f'<li><span class="num">{i+1}</span><div><h3>{h}</h3><p>{p}</p></div></li>' for i, (h, p, x) in enumerate(steps))

home = f'''<section class="cine" id="cine" aria-label="O olhar Argus">
  <div class="cine-stage">
    <div class="cine-light" aria-hidden="true"></div>
    <div class="wrap cine-hero">
      <div class="cine-copy" data-cine-copy>
        <h1 class="display split-words">Precisão para <span class="em">decisões</span> que sustentam o futuro.</h1>
        <p class="lead">Unimos profundidade técnica e visão de negócio para transformar complexidade financeira e tributária em decisões seguras, eficientes e possíveis de defender.</p>
        <div class="cine-actions">
          <a class="btn btn-dark" href="contato.html">Solicitar diagnóstico {ARR}</a>
          <a class="link" href="servicos.html">Conhecer a atuação {OUTL}</a>
        </div>
      </div>
      <div class="cine-card" data-cine-card>
        <span class="frame" data-cine-deco aria-hidden="true"></span>
        <div class="card-bg" aria-hidden="true"></div>
        <img class="card-fallback" src="assets/img/olho-digital.webp" alt="Olho digital da Argus Prime" width="1056" height="1408">
        <div class="card-inner" data-cine-deco>
          <p class="h3">Ver além do óbvio para proteger valor.</p>
          <p>Leitura integrada para decisões que precisam enxergar o todo.</p>
        </div>
      </div>
    </div>
    <div class="cine-dark" data-cine-dark aria-hidden="true"></div>
    <canvas class="cine-canvas" data-cine-canvas aria-hidden="true"></canvas>
    <div class="cine-text"><div class="wrap">{step_html}</div></div>
    <div class="cine-labels" aria-hidden="true">
      <span>Engenharia financeira<small>estrutura, dívidas, valuation, risco</small></span>
      <span>Engenharia tributária<small>planejamento, créditos, compliance</small></span>
      <span>Estratégia societária<small>fusões, aquisições, reorganização</small></span>
    </div>
    <div class="cine-rail" aria-hidden="true"><span>Olho</span><span>Dados</span><span>Leitura</span><span>Frentes</span><span>Decisão</span></div>
    <div class="cine-cue" aria-hidden="true"><i></i>Role para entrar no olho</div>
    <a class="cine-skip" href="#posicionamento">Pular sequência</a>
  </div>
</section>

<section class="sec sec-dark seq-static" aria-label="Do dado à decisão">
  <div class="wrap"><ol class="seq-list">{seq_static}</ol></div>
</section>

<section class="sec" id="posicionamento">
  <div class="wrap">
    <div class="head">
      <h2 class="h2 split-words">Finanças, tributos e estratégia em uma única leitura de negócio.</h2>
      <p class="lead rv">A Argus Prime é um hub de engenharia financeira e tributária. Conectamos frentes que costumam ser analisadas em separado e entregamos recomendações que a operação consegue aplicar.</p>
    </div>
    <div class="attrs">
      <div class="rv"><h3>Precisão técnica</h3><p>Base técnica explícita, sem excesso de jargão.</p></div>
      <div class="rv d1"><h3>Integração entre frentes</h3><p>Financeiro, fiscal e societário lidos juntos, sem pontos cegos.</p></div>
      <div class="rv d2"><h3>Discrição</h3><p>Informações da operação tratadas com confidencialidade.</p></div>
      <div class="rv d3"><h3>Recomendação aplicável</h3><p>Entregamos o próximo passo, não um relatório de gaveta.</p></div>
    </div>
  </div>
</section>

<section class="sec sec-sand">
  <div class="wrap">
    <div class="head">
      <h2 class="h2 split-words">Três frentes. Um mesmo raciocínio.</h2>
      <p class="lead rv">Cada frente pode ser contratada em separado. O ganho aparece quando as três são lidas em conjunto.</p>
    </div>
    <div class="rows">
      <a class="row rv" href="servicos.html#financeira"><h3>Engenharia financeira</h3><p>Estrutura de capital, reestruturação de dívidas, valuation e gestão de risco financeiro para decisões de longo prazo.</p><span class="go">Ver a frente {OUTL}</span></a>
      <a class="row rv" href="servicos.html#tributaria"><h3>Engenharia tributária</h3><p>Planejamento tributário, recuperação e compensação de créditos e compliance fiscal, dentro da legalidade e com fundamento documentado.</p><span class="go">Ver a frente {OUTL}</span></a>
      <a class="row rv" href="servicos.html#societaria"><h3>Estratégia societária</h3><p>Fusões, aquisições e reorganização societária, com a leitura financeira e tributária integrada desde o início.</p><span class="go">Ver a frente {OUTL}</span></a>
    </div>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="head">
      <h2 class="h2 split-words">Primeiro mapear. Depois recomendar.</h2>
    </div>
    <div class="steps">
      <span class="bar" aria-hidden="true"></span>
      <div class="step"><span class="dot" aria-label="Etapa 1">1</span><h3 class="h3">Mapear</h3><p>Levantamos os dados fiscais, contábeis e financeiros da operação, com a documentação de origem.</p></div>
      <div class="step"><span class="dot" aria-label="Etapa 2">2</span><h3 class="h3">Estruturar</h3><p>Cruzamos as frentes e desenhamos as alternativas, cada uma com base técnica e jurídica.</p></div>
      <div class="step"><span class="dot" aria-label="Etapa 3">3</span><h3 class="h3">Documentar</h3><p>Cada recomendação sai com fundamento, premissas e riscos declarados.</p></div>
      <div class="step"><span class="dot" aria-label="Etapa 4">4</span><h3 class="h3">Acompanhar</h3><p>Seguimos a implementação junto ao time do cliente até a decisão estar em vigor.</p></div>
    </div>
  </div>
</section>

<section class="band-deep">
  <div class="wrap split">
    <div class="head" style="margin-bottom:0">
      <h2 class="h2 split-words">Ao lado de quem decide.</h2>
      <p class="lead rv" style="color:var(--on-dark-2)">Trabalhamos com a diretoria financeira, o jurídico e a contabilidade do cliente. A análise acontece junto da operação, não à distância.</p>
      <a class="link rv" href="equipe.html" style="color:var(--gold)">Conhecer a equipe {OUTL}</a>
    </div>
    <figure style="margin:0">
      <div class="photo rv-mask" data-parallax><img src="assets/img/atuacao.webp" alt="Reunião de trabalho entre a equipe e a diretoria de um cliente" width="1600" height="1067" loading="lazy"><figcaption class="photo-credit">Fotografia: Pexels (licença de uso livre).</figcaption></div>
    </figure>
  </div>
</section>

<section class="sec">
  <div class="wrap">
    <div class="head-row">
      <div class="head"><h2 class="h2 split-words">Casos recentes, descritos sem identificar o cliente.</h2></div>
      <a class="link" href="cases.html">Ver todos os cases {OUTL}</a>
    </div>
    <div class="case-rows">
      <article class="case-row rv">
        <div><h3 class="h3">Reestruturação tributária</h3><span class="sector">Segurança privada</span></div>
        <p>Diagnóstico e renegociação de R$ 9,2 milhões em passivo previdenciário, com programa de parcelamento junto à Receita Federal.</p>
        <div class="metric"><b data-count="31" data-suffix="%">31%</b><span>de redução no custo tributário sobre a folha</span></div>
      </article>
      <article class="case-row rv">
        <div><h3 class="h3">Planejamento financeiro hospitalar</h3><span class="sector">Saúde</span></div>
        <p>Separação jurídica de atividades mistas, hedge cambial e renegociação de linhas de crédito para grupo hospitalar com três unidades.</p>
        <div class="metric"><b data-count="4.7" data-dec="1" data-prefix="R$ " data-suffix=" mi">R$ 4,7 mi</b><span>em economia tributária anual recorrente</span></div>
      </article>
    </div>
  </div>
</section>
''' + cta("Antes de decidir, entenda a operação por inteiro.", "O diagnóstico mapeia as frentes financeira e tributária da empresa e aponta onde há oportunidade, risco ou retrabalho. Você recebe as conclusões com a base técnica de cada uma.")
page("index", "Argus Prime | Engenharia Financeira e Tributária",
     "Engenharia financeira e tributária para empresas médias e grandes. Finanças, tributos e estratégia em uma única leitura de negócio, com base técnica explícita.", home, cur="index")

# ---------------------------------------------------------------- SOBRE
sobre = page_hero("Uma única leitura do <span class=\"em\">negócio.</span>",
  "A Argus Prime integra finanças, tributos e estratégia para que decisões relevantes tenham base técnica e jurídica explícita.") + '''
<section class="sec">
  <div class="wrap">
    <div class="head"><h2 class="h2 split-words">Propósito, posicionamento e promessa.</h2></div>
    <div class="ledger">
      <div class="rv"><h3>Propósito</h3><p>Transformar complexidade financeira e tributária em decisões seguras, eficientes e defensáveis para empresas que operam em ambiente de alta exigência.</p></div>
      <div class="rv"><h3>Posicionamento</h3><p>Um hub de engenharia financeira e tributária que integra finanças, tributos e estratégia em uma única leitura de negócio.</p></div>
      <div class="rv"><h3>Promessa</h3><p class="promise">Decisões relevantes deixam de depender de estimativas.</p></div>
    </div>
  </div>
</section>
<section class="sec sec-sand">
  <div class="wrap">
    <div class="head"><h2 class="h2 split-words">O que fazemos hoje e onde queremos chegar.</h2></div>
    <div class="cards-2">
      <div class="panel light rv"><h3>Missão</h3><p>Entregar leitura financeira e tributária que permita ao cliente decidir com segurança, dentro da legalidade e com fundamento documentado.</p></div>
      <div class="panel light rv d1"><h3>Visão</h3><p>Ser reconhecida no mercado corporativo como referência em engenharia financeira e tributária, pelo rigor técnico, pela conduta ética e por entregas que o cliente consegue verificar.</p></div>
    </div>
  </div>
</section>
<section class="sec">
  <div class="wrap">
    <div class="head"><h2 class="h2 split-words">Quatro princípios que orientam o trabalho.</h2></div>
    <div class="attrs">
      <div class="rv"><h3>Rigor técnico</h3><p>Cada análise e cada recomendação saem com base técnica explícita, premissas e riscos declarados.</p></div>
      <div class="rv d1"><h3>Confidencialidade</h3><p>As informações do cliente são tratadas com sigilo em todas as etapas do trabalho.</p></div>
      <div class="rv d2"><h3>Inovação com fundamento</h3><p>Alternativas novas para problemas conhecidos do mercado, sempre apoiadas em base jurídica.</p></div>
      <div class="rv d3"><h3>Parceria</h3><p>Relacionamento de longo prazo, construído com confiança e com entregas que o cliente consegue acompanhar.</p></div>
    </div>
  </div>
</section>
<section class="sec sec-sand">
  <div class="wrap">
    <div class="head"><h2 class="h2 split-words">O que a Argus Prime não é.</h2><p class="lead rv">Dizer o que não fazemos ajuda a definir o que esperar do trabalho.</p></div>
    <div class="ledger">
      <div class="rv"><h3>Não é consultoria genérica de gestão.</h3><p>Atuamos em engenharia financeira e tributária. Cada recomendação parte de base técnica e jurídica, não de modelo pronto.</p></div>
      <div class="rv"><h3>Não promete resultado nem ausência de risco.</h3><p>Toda alternativa sai com premissas e riscos declarados. A decisão é do cliente, com a informação completa.</p></div>
      <div class="rv"><h3>Não é fria nem impessoal.</h3><p>Trabalhamos com a diretoria financeira, o jurídico e a contabilidade do cliente, com contato direto e linguagem clara.</p></div>
      <div class="rv"><h3>Não é informal nem autopromocional.</h3><p>Dizemos o que fazemos e mostramos a base. Sem adjetivo vazio, sem promessa que a operação não possa verificar.</p></div>
    </div>
  </div>
</section>
''' + cta("Comece pelo mapa da operação.", "O diagnóstico mostra onde há oportunidade, risco ou retrabalho nas frentes financeira e tributária. Cada conclusão vem com a base técnica que a sustenta.")
page("sobre", "Sobre | Argus Prime", "Propósito, posicionamento, valores e limites da Argus Prime, hub de engenharia financeira e tributária.", sobre)

# ---------------------------------------------------------------- SERVIÇOS
def scope(items):
    return '<div class="scope">' + "".join(f'<div class="rv"><h3>{h}</h3><p>{p}</p></div>' for h, p in items) + '</div>'
serv = page_hero("Três frentes, lidas <span class=\"em\">juntas.</span>",
  "Engenharia financeira, engenharia tributária e estratégia societária. Cada frente pode ser contratada em separado. O ganho aparece quando são analisadas em conjunto.",
  '<nav class="ph-links" aria-label="Frentes"><a href="#financeira">Engenharia financeira</a><a href="#tributaria">Engenharia tributária</a><a href="#societaria">Estratégia societária</a></nav>') + f'''
<section class="sec" style="padding-top:clamp(2rem,1rem + 3vw,4rem)">
  <div class="wrap">
    <div class="front-block" id="financeira">
      <div class="side"><h2 class="h2">Engenharia financeira</h2><p>Estrutura de capital, reestruturação de dívidas, valuation e gestão de risco financeiro para decisões de longo prazo.</p></div>
      <div>{scope([("Valuation e avaliação de empresas","Determinamos o valor do negócio para fusões, aquisições ou captação de recursos, com metodologias reconhecidas."),("Reestruturação de dívidas","Organizamos o passivo e revisamos o fluxo de caixa, com foco na sustentabilidade financeira de longo prazo."),("Gestão de risco financeiro","Mapeamos exposições cambiais, de juros e de mercado e desenhamos formas de proteger o patrimônio da empresa."),("Modelagem financeira","Construímos modelos financeiros para apoiar decisões estratégicas e o planejamento de cenários.")])}</div>
    </div>
    <div class="front-block" id="tributaria">
      <div class="side"><h2 class="h2">Engenharia tributária</h2><p>Planejamento tributário, recuperação e compensação de créditos e compliance fiscal, dentro da legalidade e com fundamento documentado.</p></div>
      <div>{scope([("Planejamento tributário","Estruturamos operações com foco em eficiência fiscal dentro da legalidade, a partir da análise do regime tributário da empresa."),("Recuperação de créditos","Auditamos e levantamos tributos pagos a maior, em todas as esferas fiscais, para identificar créditos passíveis de recuperação."),("Compliance fiscal","Revisamos procedimentos para verificar a conformidade com as normas vigentes e localizar passivos ocultos.")])}
        <div class="panel rv" style="margin-top:2rem"><h3>Compensação tributária</h3><p>Cessão onerosa de créditos judiciais homologados. Estruturamos a aquisição, por cessão onerosa, de créditos judiciais homologados para empresas que querem extinguir débitos tributários federais, estaduais ou municipais por meio de compensação, com análise jurídica do crédito e da operação.</p><p class="note">Não há promessa de resultado. A viabilidade depende do crédito e da operação analisados em cada caso.</p></div>
      </div>
    </div>
    <div class="front-block" id="societaria">
      <div class="side"><h2 class="h2">Estratégia societária</h2><p>Fusões, aquisições e reorganização societária, com a leitura financeira e tributária integrada desde o início.</p></div>
      <div>{scope([("Fusões e aquisições","Acompanhamos a operação com avaliação do negócio e leitura tributária integradas desde o início."),("Reorganização societária","Reorganizamos a estrutura jurídica e societária, considerando os efeitos tributários e a proteção patrimonial.")])}</div>
    </div>
  </div>
</section>
<section class="sec sec-sand">
  <div class="wrap"><div class="head" style="margin-bottom:0"><h2 class="h2 split-words">Leitura integrada das frentes.</h2><p class="lead rv">Cruzamos as visões financeira, tributária e societária antes da decisão, para que nenhuma delas apareça como surpresa depois.</p></div></div>
</section>
''' + cta("Por qual frente a sua operação deve começar?", "O diagnóstico mapeia as frentes financeira e tributária da empresa e aponta onde há oportunidade, risco ou retrabalho. Você recebe as conclusões com a base técnica de cada uma.")
page("servicos", "Soluções | Argus Prime", "Engenharia financeira, engenharia tributária e estratégia societária: escopo de cada frente e como elas se cruzam.", serv)

# ---------------------------------------------------------------- CASES
def metric(val, label):
    return f'<div class="metric"><b>{val}</b><span>{label}</span></div>'
CASES = [
 ("Setor industrial","Otimização tributária em indústria de grande porte","Alta carga tributária e margens apertadas, em um ambiente competitivo.","Revisão da cadeia de suprimentos e reestruturação fiscal, com análise de todos os regimes tributários aplicáveis.",[('<span data-count="18" data-suffix="%">18%</span>',"Redução na carga tributária efetiva"),('<span data-count="15" data-prefix="R$ " data-suffix=" milhões">R$ 15 milhões</span>',"Em créditos tributários recuperados")],"ao do setor industrial"),
 ("Varejo","Reestruturação financeira em rede varejista","Crise de liquidez e endividamento de curto prazo em nível crítico.","Renegociação dos passivos e nova modelagem do capital de giro, com estruturação de garantias e covenants.",[('<span data-count="48" data-suffix=" meses">48 meses</span>',"Alongamento da dívida"),('<span data-count="3.5" data-dec="1" data-suffix="% a.a.">3,5% a.a.</span>',"Redução no custo médio de capital")],"ao do varejo"),
 ("Agronegócio","Planejamento tributário em grupo agroindustrial","Operações em vários estados, com regimes tributários distintos e sem integração.","Estratégia tributária unificada e aproveitamento de incentivos fiscais regionais e setoriais.",[('<span data-count="22" data-suffix="%">22%</span>',"Redução na carga tributária consolidada"),('<span data-count="8" data-prefix="R$ " data-suffix=" milhões">R$ 8 milhões</span>',"Economia fiscal anual recorrente")],"ao do agronegócio"),
 ("Tecnologia","Valuation para captação de investimento","Startup de tecnologia em busca de uma rodada Série B, sem avaliação formal.","Modelagem financeira completa, com múltiplas metodologias de valuation, e preparação do data room.",[('<span data-count="120" data-prefix="R$ " data-suffix=" milhões">R$ 120 milhões</span>',"Valuation determinado"),("Série B","Captação realizada")],"ao de tecnologia"),
 ("Segurança privada","Reestruturação tributária em empresa de segurança","Empresa de segurança patrimonial e eletrônica, com folha de pagamento elevada, passivo previdenciário acumulado e pressão sobre as margens em contratos públicos e privados.","Diagnóstico da tributação sobre a folha, revisão do enquadramento entre Simples Nacional e Lucro Presumido e programa de parcelamento de débitos, com negociação de multas e juros junto à Receita Federal.",[('<span data-count="9.2" data-dec="1" data-prefix="R$ " data-suffix=" milhões">R$ 9,2 milhões</span>',"Em passivo tributário negociado e parcelado"),('<span data-count="31" data-suffix="%">31%</span>',"Redução no custo tributário sobre a folha")],"ao de segurança privada"),
 ("Saúde","Planejamento financeiro em grupo hospitalar","Grupo hospitalar com três unidades, com descasamento de fluxo de caixa, custo alto de financiamento e complexidade fiscal por causa de atividades mistas: plano de saúde próprio e serviços de terceiros.","Reestruturação do modelo de receita, com separação jurídica das atividades, hedge cambial para insumos importados e renegociação de linhas de crédito com bancos de desenvolvimento.",[('<span data-count="4.7" data-dec="1" data-prefix="R$ " data-suffix=" milhões">R$ 4,7 milhões</span>',"Economia tributária anual recorrente"),('<span data-count="2.1" data-dec="1" data-suffix="% a.a.">2,1% a.a.</span>',"Redução no custo médio de financiamento")],"ao de saúde"),
]
cases_html = ""
for sec_, title, des, done, mets, aria in CASES:
    cases_html += f'''<article class="case-wrap rv">
      <div class="case-top"><div><h2>{title}</h2><span class="sector">{sec_}</span></div><a class="link" href="contato.html" aria-label="Conversar sobre um caso parecido {aria}">Conversar sobre um caso parecido {OUTL}</a></div>
      <div class="case-full">
        <div><span class="k">Desafio</span><p>{des}</p></div>
        <div><span class="k">O que foi feito</span><p>{done}</p></div>
        <div class="result"><span class="k">Resultado</span>{"".join(metric(v, l) for v, l in mets)}</div>
      </div>
    </article>'''
cases = page_hero("Seis casos, do desafio ao <span class=\"em\">resultado.</span>",
  "Em cada caso: o desafio, o que foi feito e o que mudou nos números do cliente. Casos descritos sem identificar os clientes.") + f'''
<section class="sec" style="padding-top:clamp(2rem,1rem + 3vw,4rem)">
  <div class="wrap">{cases_html}</div>
</section>
''' + cta("Cada operação pede uma leitura própria.", "Se a sua situação se parece com algum destes casos, o diagnóstico mostra o que se aplica à sua empresa e o que não se aplica, com a base técnica de cada ponto.")
page("cases", "Cases | Argus Prime", "Seis casos reais em seis setores: o desafio, o que foi feito e o que mudou nos números do cliente.", cases)

# ---------------------------------------------------------------- EQUIPE
def people(lst):
    return '<div class="people">' + "".join(f'<div class="person-row rv"><h3>{n}</h3><div class="pr-role"><span class="role">{r}</span><span class="area">{a}</span></div><p>{d}</p></div>' for n, r, a, d in lst) + '</div>'
equipe = page_hero("Quem conduz cada <span class=\"em\">análise.</span>",
  "Sócios, diretor e gerentes, cada um com a sua área de atuação nas frentes financeira, tributária e estratégica.") + f'''
<section class="sec" style="padding-top:clamp(2rem,1rem + 3vw,4rem)">
  <div class="wrap">
    <h2 class="group-title">Sócios e direção</h2>
    {people([("Alexandre Pereira","Sócio-fundador","Engenharia financeira","Estruturação de operações financeiras complexas e operações de M&A."),("Carolina Mendes","Sócia","Engenharia tributária","Planejamento tributário e recuperação de créditos."),("Ricardo Fonseca","Diretor","Consultoria estratégica","Atuação em consultoria estratégica.")])}
    <h2 class="group-title" style="margin-top:clamp(3rem,2rem + 3vw,5rem)">Gerência</h2>
    {people([("Luciana Santos","Gerente sênior","Compliance e riscos","Gestão de riscos financeiros e compliance regulatório."),("Marcos Oliveira","Gerente sênior","Reestruturação","Reestruturação de passivos e negociação com credores."),("Thais Almeida","Gerente","Tributário","Contencioso fiscal e recuperação de créditos.")])}
  </div>
</section>
<section class="band-deep">
  <div class="wrap split">
    <div class="head" style="margin-bottom:0">
      <h2 class="h2 split-words">Junto da operação do cliente.</h2>
      <p class="lead rv" style="color:var(--on-dark-2)">A equipe trabalha com a diretoria financeira, o jurídico e a contabilidade do cliente. A análise acontece junto da operação, não à distância.</p>
      <a class="link rv" href="servicos.html" style="color:var(--gold)">Ver as frentes de atuação {OUTL}</a>
    </div>
    <figure style="margin:0">
      <div class="photo rv-mask" data-parallax><img src="assets/img/equipe-trabalho.webp" alt="Equipe da Argus Prime em reunião de trabalho" width="1800" height="1200" loading="lazy"><figcaption class="photo-credit">Fotografia: Pexels (licença de uso livre).</figcaption></div>
    </figure>
  </div>
</section>
''' + cta("Fale com a equipe sobre a sua operação.", "O diagnóstico mapeia as frentes financeira e tributária da empresa e aponta onde há oportunidade, risco ou retrabalho. Você recebe as conclusões com a base técnica de cada uma.")
page("equipe", "Equipe | Argus Prime", "Sócios, direção e gerência da Argus Prime, com a área de atuação de cada profissional.", equipe)

# ---------------------------------------------------------------- INSIGHTS
ART = [("Atualizações tributárias","Abril 2026","Reforma Tributária: o que muda para as empresas em 2026","As principais mudanças da reforma tributária e o que elas significam, na prática, para empresas de médio e grande porte."),
 ("Gestão de riscos","Março 2026","Gestão de risco cambial em tempos de volatilidade","Estratégias para proteger o resultado operacional de empresas com exposição cambial quando o câmbio oscila muito."),
 ("Fusões e aquisições","Março 2026","Due diligence tributária: erros que custam caro em M&A","Os pontos de atenção numa due diligence tributária e como evitar passivos ocultos em transações de M&A."),
 ("Estratégia corporativa","Fevereiro 2026","Holding familiar: vantagens e cuidados na estruturação","Como uma holding pode reduzir a carga tributária e proteger o patrimônio da família, e onde estão os cuidados."),
 ("Atualizações tributárias","Fevereiro 2026","CARF: tendências nas decisões de 2025 e perspectivas para 2026","As principais decisões do CARF em 2025 e o que esperar do contencioso tributário nos próximos meses."),
 ("Gestão de riscos","Janeiro 2026","Stress test financeiro: como preparar a empresa para crises","A metodologia dos testes de estresse financeiro e como montar planos de contingência consistentes.")]
arts = '<div class="art-rows">' + "".join(f'<article class="art-row rv"><div class="meta"><span>{c}</span><span>{d}</span></div><div><h3>{t}</h3><p>{p}</p></div><span class="soon">Em breve</span></article>' for c, d, t, p in ART) + '</div>'
insights = page_hero("Análises sobre tributos, risco e <span class=\"em\">estrutura.</span>",
  "Textos da equipe sobre legislação tributária, risco financeiro e estratégia societária. Os artigos abaixo estão em preparação.") + f'''
<section class="sec" style="padding-top:clamp(2rem,1rem + 3vw,4rem)">
  <div class="wrap">
    <div class="head"><h2 class="h2 split-words">Seis temas em preparação.</h2><p class="lead rv">Cada texto trata de um ponto em que decisões financeiras e tributárias costumam se cruzar.</p></div>
    {arts}
  </div>
</section>
<section class="sec sec-sand">
  <div class="wrap head-row" style="margin-bottom:0">
    <div class="head" style="margin-bottom:0"><h2 class="h2 split-words">Quando um texto sair, ele aparece aqui.</h2><p class="lead rv">Enquanto os textos não são publicados, a Argus Prime está no LinkedIn.</p></div>
    <a class="btn btn-dark" href="{LI}" target="_blank" rel="noopener">Acompanhe no LinkedIn {OUTL}<span class="sr">(abre em nova aba)</span></a>
  </div>
</section>
''' + cta("Algum destes temas toca a sua operação?", "O diagnóstico mostra onde o tema pesa na sua empresa e o que fazer a respeito, com a base técnica de cada conclusão.")
page("insights", "Insights | Argus Prime", "Análises da equipe Argus Prime sobre tributos, risco financeiro e estratégia societária.", insights)

# ---------------------------------------------------------------- CONTATO
contato = page_hero("Peça o diagnóstico da sua <span class=\"em\">operação.</span>",
  "Descreva a situação em poucas linhas. Um sócio lê a mensagem e responde pelo e-mail informado.") + f'''
<section class="sec" style="padding-top:clamp(2rem,1rem + 3vw,4rem)">
  <div class="wrap contact">
    <div>
      <div class="head" style="margin-bottom:2.5rem">
        <h2 class="h2">Conte o que precisa ser analisado.</h2>
        <p class="lead">Poucas linhas bastam. Se faltar informação, pedimos na resposta.</p>
        <p class="caption">Os campos marcados com <span class="req" aria-hidden="true">*</span> são obrigatórios.</p>
      </div>
      <form class="form" action="enviar.php" method="post" data-form-contato novalidate>
        <label><span>Nome <span class="req" aria-hidden="true">*</span></span><input id="f-nome" name="nome" type="text" autocomplete="name" maxlength="120" required></label>
        <label><span>Empresa <span class="req" aria-hidden="true">*</span></span><input id="f-empresa" name="empresa" type="text" autocomplete="organization" maxlength="120" required></label>
        <label><span>E-mail <span class="req" aria-hidden="true">*</span></span><input id="f-email" name="email" type="email" autocomplete="email" maxlength="160" required></label>
        <label><span>Telefone (opcional)</span><input id="f-telefone" name="telefone" type="tel" autocomplete="tel" maxlength="30"></label>
        <label class="full"><span>Assunto <span class="req" aria-hidden="true">*</span></span>
          <select id="f-assunto" name="assunto" required>
            <option value="">Selecione</option>
            <option>Diagnóstico tributário</option><option>Engenharia financeira</option><option>Compensação tributária</option><option>Estratégia societária</option><option>Outro</option>
          </select>
        </label>
        <label class="full"><span>Mensagem <span class="req" aria-hidden="true">*</span></span><textarea id="f-mensagem" name="mensagem" maxlength="3000" required></textarea></label>
        <label class="check full"><input id="f-consentimento" type="checkbox" name="consentimento" value="1" required> Autorizo o uso destes dados para retorno do contato, conforme a LGPD.</label>
        <label class="trap" aria-hidden="true">Não preencha<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        <div class="full" style="display:flex;flex-direction:column;gap:1rem">
          <button class="btn btn-dark" type="submit" style="align-self:flex-start">Enviar para diagnóstico {ARR}</button>
          <p class="status" data-form-status role="status" tabindex="-1"></p>
        </div>
      </form>
    </div>
    <aside class="aside" aria-label="Outros canais">
      <div class="row">
        <h2 class="h3">Escreva direto</h2>
        <span class="mail" id="mail">contato@argusprime.com.br</span>
        <button class="copy-btn" type="button" data-copy="contato@argusprime.com.br" data-copy-target="#mail">Copiar e-mail</button>
        <a class="link" href="{WA}" target="_blank" rel="noopener">WhatsApp (11) 96205-2987 {OUTL}</a>
        <a class="link" href="{LI}" target="_blank" rel="noopener">LinkedIn {OUTL}</a>
      </div>
      <ol>
        <li><span class="num">1</span><span>Recebemos a mensagem.</span></li>
        <li><span class="num">2</span><span>Um sócio lê e responde pelo e-mail informado.</span></li>
        <li><span class="num">3</span><span>Se fizer sentido, marcamos uma conversa de diagnóstico.</span></li>
      </ol>
      <p class="caption">As informações enviadas são tratadas com confidencialidade.</p>
    </aside>
  </div>
</section>
'''
page("contato", "Contato e diagnóstico | Argus Prime", "Peça o diagnóstico da sua operação. Um sócio lê a mensagem e responde pelo e-mail informado.", contato)

# ---------------------------------------------------------------- 404
nf = page_hero("Esta página não está no <span class=\"em\">mapa.</span>",
  "O endereço pode ter mudado ou não existe mais. Volte ao início ou fale com a equipe.",
  f'<div class="cine-actions"><a class="btn btn-light" href="index.html">Voltar ao início {ARR}</a><a class="link" href="contato.html" style="color:var(--gold)">Falar com a equipe {OUTL}</a></div>')
page("404", "Página não encontrada | Argus Prime", "Página não encontrada.", nf, cur="")
print("ok")
