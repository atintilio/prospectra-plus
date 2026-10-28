'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, or } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireOrg } from '@/lib/auth';
import { getLeadCommunicationProfile, isDiscType, saveLeadCommunicationProfile } from '@/lib/communication';
import { inferDisc } from '@/lib/communication-discovery';
import { normalizeLinkedinUrl, parseCsv } from '@/lib/leads-import';

export type CommunicationActionState = { error?: string; ok?: string } | undefined;

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function validLeadId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function preferences(form: FormData) {
  return {
    preferredChannel: formText(form, 'preferredChannel') || 'unknown',
    preferredFormat: formText(form, 'preferredFormat') || 'unknown',
    notes: formText(form, 'notes').slice(0, 500),
  };
}

export async function saveDeclaredProfileAction(_: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  try {
    const ctx = await requireOrg();
    const leadId = formText(form, 'leadId');
    const typeValue = formText(form, 'profileType');
    if (!validLeadId(leadId)) return { error: 'Selecione um contato da sua carteira.' };
    if (typeValue && formText(form, 'typeDeclared') !== 'on') return { error: 'Confirme que o tipo foi informado pelo contato ou por você.' };
    if (typeValue && !isDiscType(typeValue)) return { error: 'Selecione um tipo válido ou deixe o campo sem classificação.' };
    const db = await getDb();
    const scope = { orgId: ctx.org.id, userId: ctx.user.id };
    const current = typeValue || formText(form, 'clearType') === 'on' ? null : await getLeadCommunicationProfile(db, scope, leadId);
    await saveLeadCommunicationProfile(db, scope, leadId, {
      source: typeValue || !current ? 'manual' : current.source,
      profileType: typeValue || formText(form, 'clearType') === 'on' ? typeValue || null : current?.profileType,
      answers: typeValue || formText(form, 'clearType') === 'on' ? {} : current?.answers,
      preferences: preferences(form),
    });
    revalidatePath('/comunicacao');
    revalidatePath('/inteligencia');
    return { ok: typeValue ? 'Tipo informado e preferências salvos.' : current && !formText(form, 'clearType') ? 'Preferências salvas sem alterar a avaliação existente.' : 'Preferências salvas; o tipo permanece indisponível.' };
  } catch {
    return { error: 'Não foi possível salvar. Confirme que o contato está na sua carteira e tente novamente.' };
  }
}

export async function saveObservedProfileAction(_: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  try {
    const ctx = await requireOrg();
    const leadId = formText(form, 'leadId');
    if (!validLeadId(leadId)) return { error: 'Selecione um contato da sua carteira.' };
    const answers = { q1: formText(form, 'q1'), q2: formText(form, 'q2'), q3: formText(form, 'q3'), q4: formText(form, 'q4') };
    await saveLeadCommunicationProfile(await getDb(), { orgId: ctx.org.id, userId: ctx.user.id }, leadId, {
      source: 'observational_quiz', answers, preferences: preferences(form),
    });
    revalidatePath('/comunicacao');
    revalidatePath('/inteligencia');
    return { ok: 'Respostas registradas. Qualquer tipo exibido é uma estimativa baseada nas observações.' };
  } catch {
    return { error: 'Responda às quatro perguntas e confirme que o contato está na sua carteira.' };
  }
}

// Descoberta automática de DISC por planilha (CSV colado). Até 10 contatos por envio
// (a IA GLM raciocina por chamada; lotes maiores devem ser divididos).
const MAX_DISCOVERY_ROWS = 10;

function findCol(headers: string[], keys: string[]): number {
  const h = headers.map((x) => x.trim().toLowerCase());
  for (const k of keys) { const i = h.indexOf(k); if (i >= 0) return i; }
  for (const k of keys) { const i = h.findIndex((x) => x.includes(k)); if (i >= 0) return i; }
  return -1;
}

export async function discoverProfilesAction(_: CommunicationActionState, form: FormData): Promise<CommunicationActionState> {
  const ctx = await requireOrg();
  const csv = formText(form, 'csv');
  if (!csv) return { error: 'Cole o conteúdo da planilha (CSV) com os contatos.' };
  const rows = parseCsv(csv.replace(/^﻿/, ''));
  if (rows.length < 2) return { error: 'A planilha precisa de um cabeçalho e ao menos uma linha.' };

  const header = rows[0];
  const col = {
    url: findCol(header, ['linkedin', 'url', 'perfil', 'link']),
    name: findCol(header, ['nome', 'name', 'full name', 'fullname', 'nome completo']),
    title: findCol(header, ['cargo', 'title', 'headline', 'position', 'título']),
    about: findCol(header, ['sobre', 'about', 'bio', 'resumo', 'summary', 'descrição', 'descricao']),
    notes: findCol(header, ['notas', 'notes', 'observações', 'observacoes', 'texto', 'amostra']),
  };
  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i].trim() : '');

  const db = await getDb();
  const scope = { orgId: ctx.org.id, userId: ctx.user.id };
  let matched = 0, inferred = 0, byAi = 0, notFound = 0;
  const data = rows.slice(1).filter((r) => r.some((v) => v.trim()));
  const processed = data.slice(0, MAX_DISCOVERY_ROWS);

  for (const r of processed) {
    const url = normalizeLinkedinUrl(cell(r, col.url));
    const name = cell(r, col.name);
    const matchers = [url ? eq(schema.leads.linkedinUrl, url) : undefined, name ? eq(schema.leads.fullName, name) : undefined]
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (!matchers.length) { notFound++; continue; }
    const [lead] = await db.select().from(schema.leads)
      .where(and(eq(schema.leads.orgId, ctx.org.id), eq(schema.leads.ownerId, ctx.user.id), or(...matchers)))
      .limit(1);
    if (!lead) { notFound++; continue; }
    matched++;
    const text = [cell(r, col.title) || lead.headline, lead.company, cell(r, col.about), cell(r, col.notes)].filter(Boolean).join('. ');
    const result = await inferDisc(text);
    await saveLeadCommunicationProfile(db, scope, lead.id, { source: 'inferred', profileType: result.type });
    if (result.type) { inferred++; if (result.source === 'ai') byAi++; }
  }

  revalidatePath('/comunicacao');
  revalidatePath('/inteligencia');
  const extra = data.length > processed.length ? ` (processados ${processed.length} de ${data.length}; envie o restante em outro lote)` : '';
  return { ok: `${matched} contato(s) vinculado(s), ${inferred} com perfil estimado (${byAi} pela IA)${notFound ? `, ${notFound} não encontrado(s) na sua carteira` : ''}${extra}. Toda classificação é uma estimativa.` };
}
