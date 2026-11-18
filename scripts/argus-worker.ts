/** Executor persistente do Argus; coleta apenas fontes públicas autorizadas. */
import { and, asc, eq, lt } from 'drizzle-orm';
import { getDb, schema } from '../src/db';
import { runInvestigation } from '../services/argus/worker';
import type { InvestigationTarget } from '../services/argus/types';
import { parseLeadEnrichment } from '../src/lib/argus/types';

function targetForLead(lead: { fullName: string; company: string | null; email: string | null; linkedinUrl: string | null }): InvestigationTarget {
  const target: InvestigationTarget = { name: lead.fullName, company: lead.company ?? undefined, email: lead.email ?? undefined, profileUrl: lead.linkedinUrl ?? undefined };
  if (lead.linkedinUrl) { try { target.domain = new URL(lead.linkedinUrl).hostname.replace(/^www\./, ''); } catch { /* profileUrl remains the public target */ } }
  return target;
}

async function main() {
  const db = await getDb();
  let stopped = false;
  process.on('SIGTERM', () => { stopped = true; });
  process.on('SIGINT', () => { stopped = true; });
  while (!stopped) {
    try {
      await db.update(schema.enrichmentJobs).set({ state: 'failed', error: 'Executor interrompido durante a coleta.' }).where(and(eq(schema.enrichmentJobs.state, 'running'), lt(schema.enrichmentJobs.claimedAt, new Date(Date.now() - 15 * 60_000))));
      const job = await db.transaction(async tx => {
        const [row] = await tx.select().from(schema.enrichmentJobs).where(eq(schema.enrichmentJobs.state, 'queued')).orderBy(asc(schema.enrichmentJobs.createdAt)).limit(1).for('update', { skipLocked: true });
        if (!row) return null;
        await tx.update(schema.enrichmentJobs).set({ state: 'running', claimedAt: new Date(), attempts: row.attempts + 1 }).where(eq(schema.enrichmentJobs.id, row.id));
        return row;
      });
      if (job) {
        try {
          const [lead] = await db.select({ fullName: schema.leads.fullName, company: schema.leads.company, email: schema.leads.email, linkedinUrl: schema.leads.linkedinUrl }).from(schema.leads).where(eq(schema.leads.id, job.leadId)).limit(1);
          if (!lead) throw new Error('Lead não encontrado.');
          const result = await runInvestigation({ id: job.id, target: targetForLead(lead) });
          const enrichment = parseLeadEnrichment({ version: 1, status: result.status, evidence: result.evidence.map(item => ({ id: item.id, source: item.source, url: item.url, kind: item.kind, excerpt: item.value.slice(0, 500), collectedAt: item.collectedAt, confidence: item.confidence })), signals: result.signals.map(item => ({ key: item.key, label: item.key, value: item.value, confidence: item.confidence, evidenceIds: item.evidenceIds })), conflicts: [...result.conflicts, ...result.errors] });
          // Mote do produto: se o lead veio sem LinkedIn e a busca pública descobriu o perfil,
          // grava a URL no lead — é o que destrava a automação para ele.
          const discovered = !lead.linkedinUrl
            ? result.evidence.find(e => e.kind === 'linkedin_profile' && (e.confidence === 'probable' || e.confidence === 'confirmed'))?.value
            : undefined;
          await db.transaction(async tx => {
            await tx.update(schema.leads).set({ enrichment, enrichedAt: new Date(), ...(discovered ? { linkedinUrl: discovered } : {}) }).where(eq(schema.leads.id, job.leadId));
            await tx.update(schema.enrichmentJobs).set({ state: result.status === 'failed' ? 'failed' : 'completed', result: enrichment, error: result.errors.length ? result.errors.join('; ') : null, completedAt: new Date() }).where(eq(schema.enrichmentJobs.id, job.id));
          });
        } catch (error) {
          await db.update(schema.enrichmentJobs).set({ state: 'failed', error: error instanceof Error ? error.message : 'Falha na investigação.' }).where(eq(schema.enrichmentJobs.id, job.id));
        }
      }
    } catch (error) { console.error(error instanceof Error ? error.message : 'Executor Argus indisponível.'); }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'Não foi possível iniciar o executor Argus.'); process.exitCode = 1; });
