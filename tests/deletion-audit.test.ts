import {expect,test,vi} from 'vitest';
import {schema} from '@/db';
import {deleteAuditedLeads,flushDeletionReports} from '@/lib/deletion-audit';
import {seedOrg,testDb} from './helpers';
test('deletion records only affected tenant rows; failed email persists and retries without operator approval',async()=>{
 const db=await testDb();const {org,user}=await seedOrg(db,'A');const other=await seedOrg(db,'B');
 const [lead]=await db.insert(schema.leads).values({orgId:org.id,ownerId:user.id,fullName:'XPTO',linkedinUrl:'https://linkedin.com/in/xpto'}).returning();
 const [outside]=await db.insert(schema.leads).values({orgId:other.org.id,ownerId:other.user.id,fullName:'Outro',linkedinUrl:'https://linkedin.com/in/outro'}).returning();
 await deleteAuditedLeads(db,{...user,email:'mloro@argusprime.com.br'},org,[lead.id,outside.id]);
 expect(await db.select().from(schema.leads)).toHaveLength(1);
 const [audit]=await db.select().from(schema.deletionReports);expect(audit.records).toEqual([{id:lead.id,name:'XPTO'}]);
 const send=vi.fn().mockRejectedValueOnce(new Error('mail unavailable')).mockResolvedValue(undefined);
 expect(await flushDeletionReports(db,send)).toEqual({sent:0});expect((await db.select().from(schema.deletionReports))[0].notifiedAt).toBeNull();
 expect(await flushDeletionReports(db,send)).toEqual({sent:1});expect((await db.select().from(schema.deletionReports))[0].notifiedAt).toBeTruthy();
 expect(await flushDeletionReports(db,send)).toEqual({sent:0});expect(send).toHaveBeenCalledTimes(2);
});
