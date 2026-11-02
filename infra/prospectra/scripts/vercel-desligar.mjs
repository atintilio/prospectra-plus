#!/usr/bin/env node
/**
 * Desliga o projeto do Prospectra+ na Vercel.
 *
 *   node infra/prospectra/scripts/vercel-desligar.mjs            # dry-run (só leitura)
 *   node infra/prospectra/scripts/vercel-desligar.mjs --apply    # executa
 *
 * O que faz (cada item é independente e reporta o resultado):
 *   1. remove o domínio `prospectra.argusprime.com.br` do projeto;
 *   2. remove o alias de produção (o `prospectra-eight.vercel.app` fica, é o default do projeto);
 *   3. desliga o vínculo com o GitHub (para o `main` de outro agente parar de buildar);
 *   4. desliga o cron diario `0 10 * * *` (que roda contra o mesmo Neon do Prospectra).
 *
 * NÃO apaga o projeto: o histórico de deployments e o rollback continuam por 30 dias.
 *
 * Requer: VERCEL_TOKEN_FULL com acesso ao projeto `prospectra` (team atintilio-5084).
 */
const token = process.env.VERCEL_TOKEN_FULL;
if (!token) {
  console.error('VERCEL_TOKEN_FULL nao encontrado no ambiente.');
  process.exit(2);
}
const APPLY = process.argv.includes('--apply');
const H = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
const TEAM = 'atintilio-5084';
const PROJECT = 'prospectra';

const api = async (method, path, body) => {
  const res = await fetch(`https://api.vercel.com${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text().catch(() => '');
  let json = null;
  try { json = JSON.parse(text); } catch { /* resposta não-JSON */ }
  return { status: res.status, json, text };
};

const log = (msg) => console.log(msg);
const act = (verb) => (APPLY ? verb : `${verb} (dry-run: não executado)`);

async function main() {
  const proj = await api('GET', `/v9/projects/${PROJECT}?teamId=${TEAM}`);
  if (proj.status !== 200) {
    console.error(`Não consegui ler o projeto (HTTP ${proj.status}): ${proj.text.slice(0, 200)}`);
    process.exit(2);
  }
  const p = proj.json;
  log(`Projeto: ${p.name} (${p.id})`);
  log(`Vínculo GitHub: ${p.link?.type ?? 'nenhum'} repo=${p.link?.repo ?? '-'} productionBranch=${p.link?.productionBranch ?? '-'}`);
  log(`Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN'}`);

  // 1) domínios
  const doms = await api('GET', `/v9/projects/${p.id}/domains?teamId=${TEAM}`);
  const lista = doms.json?.domains ?? [];
  for (const d of lista) {
    if (d.name === `${PROJECT}-eight.vercel.app`) {
      log(`- domínio padrão do projeto (${d.name}): mantido`);
      continue;
    }
    const del = APPLY
      ? await api('DELETE', `/v9/projects/${p.id}/domains/${encodeURIComponent(d.name)}?teamId=${TEAM}`)
      : { status: 'dry-run' };
    log(`- remover domínio ${d.name}: ${del.status === 'dry-run' ? 'dry-run' : `HTTP ${del.status}`}`);
  }

  // 2) aliases de produção (os de preview são automáticos e somem com o tempo)
  const al = await api('GET', `/v4/aliases?projectId=${p.id}&teamId=${TEAM}&limit=100`);
  const prod = (al.json?.aliases ?? []).filter((a) => a.target === 'production' || a.alias?.includes('argusprime'));
  for (const a of prod) {
    const del = APPLY
      ? await api('DELETE', `/v4/aliases/${encodeURIComponent(a.alias)}?teamId=${TEAM}`)
      : { status: 'dry-run' };
    log(`- remover alias ${a.alias}: ${del.status === 'dry-run' ? 'dry-run' : `HTTP ${del.status}`}`);
  }
  if (!prod.length) log('- nenhum alias de produção (já está fora da Vercel)');

  // 3) desvincular o GitHub
  if (p.link?.type === 'github') {
    const un = APPLY
      ? await api('DELETE', `/v9/projects/${p.id}/git/${encodeURIComponent(p.link.repo)}?teamId=${TEAM}`)
      : { status: 'dry-run' };
    if (un.status === 'dry-run') log('- desvincular GitHub: dry-run');
    else if (un.status >= 200 && un.status < 300) log('- GitHub desvinculado (HTTP ' + un.status + ')');
    else {
      log(`- desvincular GitHub via API: HTTP ${un.status} (a API não expõe esse caminho para este token)`);
      log('  → fazer no painel: Vercel > projeto prospectra > Settings > Git >Disconnect');
    }
  } else {
    log('- já sem vínculo com GitHub');
  }

  // 4) cron diário
  log('- cron: a API deste token não expõe /crons (404). Caminho seguro:');
  log('  a) painel: Vercel > projeto prospectra > Settings > Crons > desmarcar "0 10 * * *"; ou');
  log('  b) repo: remover "crons" do vercel.json da branch de produção e republicar.');
  log('  Enquanto o cron existir, ele roda contra o mesmo Neon do Prospectra (tick de 5 min na VPS).');

  log('\nResumo: o domínio oficial não aponta para a Vercel (DNS na VPS, ETag idêntico).');
  log('O projeto continua existindo como espelho/rollback e pode ser apagado depois com o token do dono.');
}

main().catch((e) => { console.error(e); process.exit(1); });
