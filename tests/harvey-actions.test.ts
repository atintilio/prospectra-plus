import {afterEach,expect,it,vi} from 'vitest';
import {eq} from 'drizzle-orm';
import type {DB} from '@/db';
import type {Ctx} from '@/lib/auth';
import * as schema from '@/db/schema';
import {seedOrg,testDb} from './helpers';
import {generateCommercialAction} from '@/app/(app)/inteligencia/actions';
const state=vi.hoisted(()=>({db:null as unknown as DB,ctx:null as unknown as Ctx}));
vi.mock('@/db',async original=>({...await original<typeof import('@/db')>(),getDb:async()=>state.db}));
vi.mock('@/lib/auth',()=>({requireOrg:async()=>state.ctx}));
vi.mock('next/cache',()=>({revalidatePath:()=>{}}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
async function setup(intent:string){
 const db=state.db=await testDb();const {user,org}=await seedOrg(db);const other=await seedOrg(db,'Outro');state.ctx={user,org,role:'owner',sessionId:'test'};
 const records=[];
 for(const [index,owner] of [user,user,other.user].entries()){
  const tenant=index===2?other.org:org;
  const [lead]=await db.insert(schema.leads).values({orgId:tenant.id,ownerId:owner.id,fullName:`Lead ${index}`,linkedinUrl:`https://linkedin.com/in/test-${index}`,notes:'Nota existente'}).returning();
  const [campaign]=await db.insert(schema.campaigns).values({orgId:tenant.id,ownerId:owner.id,name:'Campanha',status:'active'}).returning();
  const [enrollment]=await db.insert(schema.enrollments).values({orgId:tenant.id,leadId:lead.id,campaignId:campaign.id,state:intent==='opt_out'?'waiting_accept':'running'}).returning();
  for(const [stepIndex,status] of ['done','pending'].entries())await db.insert(schema.actions).values({orgId:tenant.id,userId:owner.id,enrollmentId:enrollment.id,campaignId:campaign.id,leadId:lead.id,stepIndex,type:'message',status:status as 'done'|'pending',dueDate:'2026-10-26'});
  records.push({lead,enrollment});
 }
 vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_MODEL','openrouter/free');
 vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify({offerIndex:0,question:'priority',intent,topic:'commercial',evidence:[]})}}]}));
 const request={leadId:records[0].lead.id,sellerName:'Vendedor',strategy:'Entender prioridades.',offers:[{name:'Diagnóstico',description:'Mapeamos o processo comercial.'}],inbound:intent==='opt_out'?'Pare de me contatar':'',approved:true};
 return {db,records,request};
}
it.each(['interested','opt_out'])('handoff %s stops only selected lead and retains completed actions',async intent=>{
 const {db,records,request}=await setup(intent);expect((await generateCommercialAction(request)).saved).toBe(true);
 const enrollments=await db.select().from(schema.enrollments);expect(enrollments.find(e=>e.id===records[0].enrollment.id)?.state).toBe('stopped');
 for(const r of records.slice(1))expect(enrollments.find(e=>e.id===r.enrollment.id)?.state).toBe(intent==='opt_out'?'waiting_accept':'running');
 const actions=await db.select().from(schema.actions);expect(actions.filter(a=>a.leadId===records[0].lead.id).map(a=>a.status).sort()).toEqual(['done','skipped']);
 for(const r of records.slice(1))expect(actions.filter(a=>a.leadId===r.lead.id).map(a=>a.status).sort()).toEqual(['done','pending']);
 const [lead]=await db.select().from(schema.leads).where(eq(schema.leads.id,records[0].lead.id));expect(lead.notes).toContain('Nota existente');expect(lead.notes).toContain('revisão pendente');expect(lead.stage).toBe(intent==='opt_out'?'do_not_contact':'new');expect(await db.select().from(schema.events)).toHaveLength(0);
});
it('without handoff preserves cadence and rejects another tenant or owner',async()=>{
 const {db,records,request}=await setup('outreach');expect((await generateCommercialAction(request)).saved).toBe(true);
 expect((await db.select().from(schema.enrollments)).every(e=>e.state==='running')).toBe(true);expect((await db.select().from(schema.actions)).filter(a=>a.status==='pending')).toHaveLength(3);
 expect((await generateCommercialAction({...request,leadId:records[2].lead.id})).error).toBeTruthy();state.ctx={...state.ctx,user:{...state.ctx.user,id:records[2].lead.ownerId!}};expect((await generateCommercialAction(request)).error).toBeTruthy();
 const [otherLead]=await db.select().from(schema.leads).where(eq(schema.leads.id,records[2].lead.id));expect(otherLead.notes).toBe('Nota existente');
});
