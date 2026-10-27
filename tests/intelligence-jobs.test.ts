import {test,expect} from 'vitest';
import {testDb,seedOrg} from './helpers';
import {schema} from '@/db';
import {eq,sql} from 'drizzle-orm';
import {readFileSync} from 'node:fs';
import {queueLeadAnalysis,listLeadAnalysis} from '@/lib/intelligence/jobs';

test('lead analysis is durable, idempotent and isolated by seller and operation',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Intel A'),b=await seedOrg(db,'Intel B');
 const [lead]=await db.insert(schema.leads).values({orgId:a.org.id,ownerId:a.user.id,linkedinUrl:'https://www.linkedin.com/in/test',fullName:'Pessoa',company:'Empresa',headline:'Diretor'}).returning();
 const scope={orgId:a.org.id,userId:a.user.id},id=crypto.randomUUID();
 expect((await queueLeadAnalysis(db,scope,lead.id,id)).state).toBe('queued');
 expect((await queueLeadAnalysis(db,scope,lead.id,id)).id).toBe(id);
 expect(await listLeadAnalysis(db,{orgId:b.org.id,userId:b.user.id})).toEqual([]);
 expect((await listLeadAnalysis(db,scope))).toHaveLength(1);
 await expect(queueLeadAnalysis(db,{orgId:b.org.id,userId:b.user.id},lead.id,crypto.randomUUID())).rejects.toThrow();
 await expect(queueLeadAnalysis(db,{orgId:b.org.id,userId:b.user.id},lead.id,id)).rejects.toThrow();
});
test('analysis rejects inactive users, demo, nonowned leads and do-not-contact leads',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Intel C'); const scope={orgId:a.org.id,userId:a.user.id};
 const [lead]=await db.insert(schema.leads).values({orgId:a.org.id,ownerId:a.user.id,linkedinUrl:'https://www.linkedin.com/in/excluded',fullName:'Pessoa',stage:'do_not_contact'}).returning();
 await expect(queueLeadAnalysis(db,scope,lead.id,crypto.randomUUID())).rejects.toThrow();
 await db.update(schema.leads).set({stage:'new',ownerId:null}).where(eq(schema.leads.id,lead.id));
 await expect(queueLeadAnalysis(db,scope,lead.id,crypto.randomUUID())).rejects.toThrow();
 await db.update(schema.leads).set({ownerId:a.user.id}).where(eq(schema.leads.id,lead.id));
 await db.update(schema.orgs).set({isDemo:true}).where(eq(schema.orgs.id,a.org.id));
 await expect(queueLeadAnalysis(db,scope,lead.id,crypto.randomUUID())).rejects.toThrow();
 await db.update(schema.orgs).set({isDemo:false}).where(eq(schema.orgs.id,a.org.id));
 await db.update(schema.users).set({status:'disabled'}).where(eq(schema.users.id,a.user.id));
 await expect(queueLeadAnalysis(db,scope,lead.id,crypto.randomUUID())).rejects.toThrow();
});

test('actual worker SQL leases jobs, recovers interrupted analysis and stops after three claims',async()=>{
 const blocks=[...readFileSync('services/intelligence/prospectra_intelligence/worker.py','utf8').matchAll(/cursor.execute\("""([\s\S]*?)"""/g)].map(match=>match[1]);
 const db=await testDb(),a=await seedOrg(db,'Intel Worker');
 const [lead]=await db.insert(schema.leads).values({orgId:a.org.id,ownerId:a.user.id,linkedinUrl:'https://www.linkedin.com/in/worker',fullName:'Pessoa'}).returning();
 const id=crypto.randomUUID(); await queueLeadAnalysis(db,{orgId:a.org.id,userId:a.user.id},lead.id,id);
 const claim=()=>db.execute(sql.raw(blocks[2]));
 await claim(); await claim();
 let [row]=await db.select().from(schema.intelligenceJobs);
 expect(row.state).toBe('running');expect(row.attempts).toBe(1);
 await db.update(schema.intelligenceJobs).set({claimedAt:new Date(0)}).where(eq(schema.intelligenceJobs.id,id));
 await claim();
 [row]=await db.select().from(schema.intelligenceJobs);expect(row.attempts).toBe(2);
 await db.update(schema.intelligenceJobs).set({claimedAt:new Date(0)}).where(eq(schema.intelligenceJobs.id,id));
 await claim();
 await db.update(schema.intelligenceJobs).set({claimedAt:new Date(0)}).where(eq(schema.intelligenceJobs.id,id));
 await db.execute(sql.raw(blocks[1]));await claim();
 [row]=await db.select().from(schema.intelligenceJobs);expect(row.state).toBe('failed');expect(row.attempts).toBe(3);
 const id2=crypto.randomUUID();await queueLeadAnalysis(db,{orgId:a.org.id,userId:a.user.id},lead.id,id2);
 await db.update(schema.users).set({status:'disabled'}).where(eq(schema.users.id,a.user.id));
 await db.execute(sql.raw(blocks[0]));
 [row]=await db.select().from(schema.intelligenceJobs).where(eq(schema.intelligenceJobs.id,id2));
 expect(row.state).toBe('cancelled');expect(row.result).toBeNull();
});

test('server-enforced daily cap cannot be bypassed by changing command IDs',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Intel Limit');
 const [lead]=await db.insert(schema.leads).values({orgId:a.org.id,ownerId:a.user.id,linkedinUrl:'https://www.linkedin.com/in/limit',fullName:'Pessoa'}).returning();
 await db.insert(schema.intelligenceJobs).values(Array.from({length:100},()=>({id:crypto.randomUUID(),orgId:a.org.id,userId:a.user.id,leadId:lead.id})));
 await expect(queueLeadAnalysis(db,{orgId:a.org.id,userId:a.user.id},lead.id,crypto.randomUUID())).rejects.toThrow('Limite diário');
});
