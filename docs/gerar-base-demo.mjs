// Gera a "base demo": 100 leads fictícios em CSV, prontos para subir em /leads.
//   node docs/gerar-base-demo.mjs
// Saída: docs/base-demo.csv
// Determinístico: rodar de novo gera exatamente o mesmo arquivo.
import { writeFileSync } from 'node:fs';

// Nomes por gênero, para o cargo bater com a pessoa.
const PRENOMES_M = [
  'Bruno', 'Daniel', 'Felipe', 'Henrique', 'João', 'Lucas', 'Nathan', 'Paulo', 'Rafael', 'Thiago',
  'Ulisses', 'Wagner', 'André', 'Caio', 'Emanuel', 'Gustavo', 'Igor', 'Leonardo', 'Nelson', 'Renato',
  'Fernando', 'Marcelo', 'Ricardo', 'Sérgio', 'Tiago',
];

const PRENOMES_F = [
  'Ana', 'Carla', 'Eduarda', 'Gabriela', 'Isabela', 'Karina', 'Mariana', 'Olívia', 'Queila', 'Sabrina',
  'Vanessa', 'Yasmin', 'Beatriz', 'Débora', 'Fernanda', 'Helena', 'Juliana', 'Marcela', 'Patrícia', 'Sofia',
  'Adriana', 'Cristiane', 'Letícia', 'Renata', 'Tatiane',
];

const PRENOMES = [
  'Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karina', 'Lucas', 'Mariana', 'Nathan', 'Olívia', 'Paulo', 'Queila', 'Rafael', 'Sabrina', 'Thiago',
  'Ulisses', 'Vanessa', 'Wagner', 'Yasmin', 'André', 'Beatriz', 'Caio', 'Débora', 'Emanuel', 'Fernanda',
  'Gustavo', 'Helena', 'Igor', 'Juliana', 'Leonardo', 'Marcela', 'Nelson', 'Patrícia', 'Renato', 'Sofia',
];

const SOBRENOMES = [
  'Almeida', 'Barbosa', 'Cardoso', 'Duarte', 'Esteves', 'Farias', 'Gonçalves', 'Hoffmann', 'Ibrahim', 'Jardim',
  'Klein', 'Lorenz', 'Machado', 'Nogueira', 'Oliveira', 'Pereira', 'Queiroz', 'Ribeiro', 'Sampaio', 'Tavares',
  'Uchôa', 'Vasconcelos', 'Werneck', 'Xavier', 'Yamamoto', 'Zanella', 'Albuquerque', 'Bittencourt', 'Carvalho', 'Duarte',
  'Ebersol', 'Fontes', 'Guimarães', 'Hass', 'Ianes', 'Jardim', 'Klein', 'Lemos', 'Moraes', 'Nunes',
];

// Cargo -> perfil de empresa coerente.
const CARGOS = [
  ['CFO', 'industria', 16, 'n'],
  ['Diretor Financeiro', 'industria', 12, 'm'],
  ['Diretora Financeira', 'industria', 8, 'f'],
  ['Head de Controladoria', 'industria', 8, 'n'],
  ['Controller', 'industria', 8, 'n'],
  ['Gerente Tributário', 'industria', 7, 'm'],
  ['Gerente Tributária', 'industria', 7, 'f'],
  ['Head de Finanças', 'industria', 8, 'n'],
  ['Sócio', 'escritorio', 6, 'm'],
  ['Sócia', 'escritorio', 5, 'f'],
  ['Sócio-diretor', 'escritorio', 4, 'm'],
  ['Contador Sênior', 'escritorio', 5, 'm'],
  ['Contadora Sênior', 'escritorio', 4, 'f'],
  ['Head de Parcerias', 'escritorio', 4, 'n'],
  ['Diretor Comercial', 'industria', 4, 'm'],
  ['CEO', 'industria', 8, 'n'],
];

const EMPRESAS = {
  industria: [
    'Metalúrgica Vale do Sul', 'Grupo Alvorada Têxtil', 'Transportes Rota Sul', 'Frigorífico Pampa',
    'Laticínios Serra Verde', 'Construtora Horizonte', 'Pisos Aurora', 'Tecelagem Morro Grande',
    'Fiação Bom Retiro', 'Metalúrgica Cascata', 'Embalagens Bandeirante', 'Autopeças Unidas', 'Plásticos Ipiranga',
    'Alimentos Serra Azul', 'Química Vale Verde', 'Cervejaria Aurora', 'Logística Pantanal',
    'Farma Distribuidora', 'Varejo Horizonte Sul', 'Energia Solar Chapada', 'Rede Saúde Integral',
    'Engenharia Quintela', 'Siderúrgica Ipiranga', 'Papel e Celulose Aurora', 'Cervejaria Porto Alegrense',
    'Móveis Bento', 'Tecnologia Andorinha', 'Varejo Bella Vista', 'Logística Expresso Sul',
    'Farma Vida', 'Material de Construção Pilar', 'Transportes Astral', 'AgroSafra Norte',
    'Frigorífico Serra', 'Cerealistas do Cerrado', 'Cimento Pedreira', 'Vidros Cristal',
    'Bebidas Serra', 'Supermercados Bandeirante', 'Cosméticos Alvorada', 'Bebidas Aurora',
    'Metalúrgica Ipiranga', 'Caminhões Rodovia', 'Peças e Acessórios', 'Móveis Nórdicos',
    'Têxteis Santa Rita', 'Guindastes Elevar', 'Calçados Novo Horizonte', 'Plásticos Guanabara',
    'Distribuidora Planalto', 'Transportes Marítimos', 'Farma Industrial', 'Sucos da Serra',
    'Linhas Pipas', 'Refrigeração Polar', 'Materiais de Construção', 'Metalúrgica Andorinha',
    'Fiação Aurora', 'Transportes Serra', 'Café Sul', 'Oleícola Serra',
    'Açúcar Cristal', 'Fábrica de Móveis', 'Roupas Têmporas', 'Papel Sul',
  ],
  escritorio: [
    'Souza & Rocha Contadores', 'Oliveira Assessoria Contábil', 'TN Consultoria Fiscal',
    'Contabilizei Regional', 'Salles Auditoria', 'Barbosa Advogados Associados', 'Grupo Contábil Aurora',
    'Mendes Contabilidade', 'Ferraz & Filhos Contabilidade', 'AuditRio Auditoria', 'Precisa Contábil',
    'Contabilidade Serra Verde', 'Ribeiro & Cia Contadores', 'Vetor Fiscal', 'Almeida Contabilidade',
    'Contabilidade Bom Retiro', 'Nogueira Consultoria', 'Carvalho & Associados', 'Exato Contabilidade',
    'Pauta Fiscal', 'Contabilidade Ipiranga',
  ],
};

const CIDADES = [
  'Joinville, SC', 'Blumenau, SC', 'Chapecó, SC', 'Itajaí, SC', 'Criciúma, SC', 'Lages, SC',
  'São Bento do Sul, SC', 'Brusque, SC', 'Novo Hamburgo, RS', 'Porto Alegre, RS', 'Caxias do Sul, RS',
  'Passo Fundo, RS', 'Curitiba, PR', 'Londrina, PR', 'Maringá, PR', 'Belo Horizonte, MG',
  'Uberlândia, MG', 'Goiânia, GO', 'Anápolis, GO', 'Cuiabá, MT', 'Campo Grande, MS', 'São Paulo, SP',
  'Campinas, SP', 'Ribeirão Preto, SP', 'Recife, PE', 'Salvador, BA', 'Vitória, ES', 'Fortaleza, CE',
];

const TAGS = [
  'CFO', 'financeiro', 'tributario', 'contadores', 'industria', 'controladoria',
];

// ---------------------------------------------------------------------------

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const usadosNome = new Set();
const usadosEmpresa = new Set();
const usadosCidade = new Map();

function proximo(a, b, usados, tamanho) {
  // escolhe o item menos usado (round-robin determinístico) para espalhar bem
  let melhor = a[0];
  let menor = Infinity;
  for (const item of a) {
    const n = usados.get(item) ?? 0;
    if (n < menor) { menor = n; melhor = item; }
  }
  usados.set(melhor, (usados.get(melhor) ?? 0) + 1);
  return melhor;
}

function nomeUnico(rand, genero) {
  const lista = genero === 'f' ? PRENOMES_F : genero === 'm' ? PRENOMES_M : PRENOMES;
  for (let i = 0; i < 500; i++) {
    const p = lista[Math.floor(rand() * lista.length)];
    const s = SOBRENOMES[Math.floor(rand() * SOBRENOMES.length)];
    const completo = `${p} ${s}`;
    if (!usadosNome.has(completo)) { usadosNome.add(completo); return completo; }
  }
  const completo = `${lista[usadosNome.size % lista.length]} ${SOBRENOMES[usadosNome.size % SOBRENOMES.length]} ${usadosNome.size}`;
  usadosNome.add(completo);
  return completo;
}

function empresaUnica(setor, rand) {
  const lista = EMPRESAS[setor];
  for (let i = 0; i < 500; i++) {
    const e = lista[Math.floor(rand() * lista.length)];
    if (!usadosEmpresa.has(e)) { usadosEmpresa.add(e); return e; }
  }
  const e = `${lista[0]} ${usadosEmpresa.size}`;
  usadosEmpresa.add(e);
  return e;
}

// gerador determinístico (mulberry32)
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20261031);
const TOTAL = 100;
const linhas = [];

// distribui os cargos respeitando o peso de cada um
const filaCargos = [];
for (const [cargo, setor, peso, genero] of CARGOS) for (let i = 0; i < peso; i++) filaCargos.push([cargo, setor, genero]);
// embaralha determinístico
for (let i = filaCargos.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [filaCargos[i], filaCargos[j]] = [filaCargos[j], filaCargos[i]];
}

for (let i = 0; i < TOTAL; i++) {
  const [cargo, setor, genero] = filaCargos[i % filaCargos.length];
  const nome = nomeUnico(rand, genero);
  const empresa = empresaUnica(setor, rand);
  const cidade = proximo(CIDADES, null, usadosCidade, 1);
  const primeiro = nome.split(' ')[0].toLowerCase();
  const ultimo = slug(nome.split(' ').slice(-1)[0]);
  const url = `https://www.linkedin.com/in/${primeiro}-${ultimo}-base-demo-${i + 1}`;
  const email = `${primeiro}.${ultimo}.${i + 1}@demo.invalid`;
  const ddd = 48 + Math.floor(rand() * 20); // 48..67
  const telefone = `+55 ${ddd} 9${String(1000 + Math.floor(rand() * 9000)).slice(0, 4)}-${String(1000 + Math.floor(rand() * 9000)).slice(0, 4)}`;
  linhas.push({ url, nome, cargo, empresa, cidade, email, telefone });
}

// âncora de saída
const linhasCsv = [
  ['linkedin url', 'nome', 'cargo', 'empresa', 'cidade', 'email', 'telefone'].join(','),
  ...linhas.map((l) => [l.url, l.nome, l.cargo, l.empresa, `"${l.cidade}"`, l.email, l.telefone].join(',')),
];

const saida = `${linhasCsv.join('\n')}\n`;
const destino = new URL('./base-demo.csv', import.meta.url);
writeFileSync(destino, saida, 'utf8');

console.log(`${linhas.length} leads gerados em docs/base-demo.csv`);
console.log('cargos:', [...new Set(linhas.map((l) => l.cargo))].join(', '));
console.log('empresas distintas:', usadosEmpresa.size, '| cidades usadas:', usadosCidade.size);
console.log(linhasCsv.slice(0, 4).join('\n'));
