import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { schema, type DB } from '@/db';
import { isPrimaryAdmin } from './admin-policy';
import { sendDeletionReport } from './mailer';

/** Atomic deletion + owner audit. Production only; no report for simulated data. */
export async function deleteAuditedLeads(db: DB, actor: {id:string;email:string}, org: {id:string;name:string;isDemo:boolean}, ids: string[], ownerOnly=false) {
  const { inArray } = await import('drizzle-orm');
  if (!ids.length) return;
  await db.transaction(async tx => {
    const rows = await tx.delete(schema.leads).where(and(eq(schema.leads.orgId,org.id), inArray(schema.leads.id,ids), ownerOnly ? eq(schema.leads.ownerId,actor.id) : undefined)).returning({id:schema.leads.id,name:schema.leads.fullName});
    if (rows.length && !org.isDemo && !isPrimaryAdmin(actor.email)) await tx.insert(schema.deletionReports).values({actorId:actor.id,actorEmail:actor.email,orgId:org.id,orgName:org.name,records:rows});
  });
}

/** Lease prevents simultaneous delivery; a failed send stays pending for the next run. */
export async function flushDeletionReports(db: DB, send=sendDeletionReport) {
  let sent=0;
  for(let i=0;i<20;i++) {
    const cutoff=new Date(Date.now()-5*60_000);
    const [report]=await db.transaction(async tx=>{
      const [due]=await tx.select().from(schema.deletionReports).where(and(isNull(schema.deletionReports.notifiedAt),or(isNull(schema.deletionReports.claimedAt),lt(schema.deletionReports.claimedAt,cutoff)))).orderBy(schema.deletionReports.createdAt).limit(1).for('update',{skipLocked:true});
      if(!due)return [];
      return tx.update(schema.deletionReports).set({claimedAt:new Date()}).where(eq(schema.deletionReports.id,due.id)).returning();
    });
    if(!report)break;
    try {await send(report);await db.update(schema.deletionReports).set({notifiedAt:new Date(),claimedAt:null}).where(eq(schema.deletionReports.id,report.id));sent++;}
    catch {await db.update(schema.deletionReports).set({claimedAt:null}).where(eq(schema.deletionReports.id,report.id));break;}
  }
  return {sent};
}
