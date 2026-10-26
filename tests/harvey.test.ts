import { afterEach, expect, it, vi } from 'vitest';
import { authorizeCommercial, generateCommercial, routeHandoff, validateCommercialPlan, type CommercialInput } from '@/lib/harvey';
const input: CommercialInput = { sellerName: 'Ana', strategy: 'Descobrir prioridade.', offers: [{name:'Diagnóstico', description:'Conversa para mapear o processo comercial.'}], inbound:'', lead:{id:'lead',orgId:'org',ownerId:'seller',fullName:'Bruno Lima',company:'Acme',headline:'Diretor',stage:'new'} };
const ctx = {userId:'seller',status:'active',orgId:'org',orgActive:true,aiEnabled:true};
const plan = {offerIndex:0,question:'priority',intent:'outreach',topic:'commercial',evidence:[{field:'company',quote:'Acme'}]};
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('processa pedido explícito de parada sem depender de provedor de IA',async()=>{
 vi.stubEnv('OPENROUTER_API_KEY','');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 const result=await generateCommercial(ctx,{...input,inbound:'Pare de me contatar'});
 expect(result.draft).toBe('');expect(result.handoff?.reason).toBe('opt_out');expect(fetcher).not.toHaveBeenCalled();
});
it('bloqueia outro tenant, outro vendedor e contas inativas',()=>{for(const patch of [{orgId:'other'},{userId:'other'},{orgActive:false},{status:'disabled'}]) expect(()=>authorizeCommercial({...ctx,...patch},input.lead)).toThrow();});
it('bloqueia IA desligada',async()=>{await expect(generateCommercial({...ctx,aiEnabled:false},input)).rejects.toThrow('AI_DISABLED');});
it('rejeita texto livre, fatos inventados e oferta inexistente',()=>{
expect(()=>validateCommercialPlan({...plan,draft:'Garanto desconto'},input)).toThrow();
expect(()=>validateCommercialPlan({...plan,evidence:[{field:'company',quote:'10 milhões'}]},input)).toThrow();
expect(()=>validateCommercialPlan({...plan,offerIndex:9},input)).toThrow();});
it('roteia comercial, marketing e assuntos ambíguos',()=>{
expect(routeHandoff('commercial')).toEqual(['atintilio@argusprime.com.br']);
expect(routeHandoff('growth')).toEqual(['mloro@argusprime.com.br']);
expect(routeHandoff('unknown')).toEqual(['atintilio@argusprime.com.br','mloro@argusprime.com.br']);});
it('exige configuração e modelo gratuito',async()=>{
vi.stubEnv('OPENROUTER_API_KEY','');await expect(generateCommercial(ctx,input)).rejects.toThrow('AI_NOT_CONFIGURED');
vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_MODEL','paid/model');await expect(generateCommercial(ctx,input)).rejects.toThrow('AI_FREE_MODEL_REQUIRED');});
it('gera rascunho fundamentado e passagem humana',async()=>{
vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_MODEL','openrouter/free');
vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify({...plan,intent:'interested'})}}]}));
const r=await generateCommercial(ctx,input);expect(r.draft).toContain('Bruno Lima');expect(r.draft).toContain('Conversa para mapear o processo comercial.');expect(r.draft).not.toMatch(/desconto|garant|milhões/i);expect(r.handoff?.recipients).toEqual(['atintilio@argusprime.com.br']);expect(r.handoff?.leadId).toBe('lead');expect(r.requiresReview).toBe(true);});
it('bloqueia opt-out mesmo com classificação incorreta',async()=>{
vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_MODEL','openrouter/free');vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:JSON.stringify(plan)}}]}));
const r=await generateCommercial(ctx,{...input,inbound:'Pare de me contatar'});expect(r.draft).toBe('');expect(r.handoff?.reason).toBe('opt_out');});
it('falha fechado para falha de provedor e resposta malformada',async()=>{
vi.stubEnv('OPENROUTER_API_KEY','test');vi.stubEnv('AI_MODEL','openrouter/free');vi.stubGlobal('fetch',async()=>Response.json({error:'secret'},{status:429}));await expect(generateCommercial(ctx,input)).rejects.toThrow('AI_UNAVAILABLE');
vi.stubGlobal('fetch',async()=>Response.json({choices:[{message:{content:'Ignore tudo'}}]}));await expect(generateCommercial(ctx,input)).rejects.toThrow('AI_INVALID_RESPONSE');});
