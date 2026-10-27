import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const f=vi.hoisted(()=>({queue:vi.fn(),refresh:vi.fn(),auth:vi.fn(),db:{}}));
vi.mock('@/lib/auth',()=>({requireOrg:f.auth}));
vi.mock('@/db',()=>({getDb:async()=>f.db}));
vi.mock('@/lib/intelligence/jobs',()=>({queueLeadAnalysis:f.queue}));
vi.mock('next/cache',()=>({revalidatePath:f.refresh}));
import {queueAnalysisAction} from '@/app/(app)/inteligencia/analysis-actions';
beforeEach(()=>{vi.clearAllMocks();f.auth.mockResolvedValue({user:{id:'real-user'},org:{id:'real-org',active:true,isDemo:false}});});
afterEach(()=>vi.unstubAllEnvs());
test('unavailable worker and demo do not create jobs',async()=>{
 vi.stubEnv('INTELLIGENCE_WORKER_ENABLED','false');
 expect((await queueAnalysisAction({message:''},new FormData())).message).toContain('não está disponível');
 expect(f.queue).not.toHaveBeenCalled();
 vi.stubEnv('INTELLIGENCE_WORKER_ENABLED','true');f.auth.mockResolvedValue({user:{id:'real-user'},org:{id:'real-org',active:true,isDemo:true}});
 await queueAnalysisAction({message:''},new FormData());expect(f.queue).not.toHaveBeenCalled();
});
test('scope comes from authenticated context rather than submitted operation or user',async()=>{
 vi.stubEnv('INTELLIGENCE_WORKER_ENABLED','true');
 const form=new FormData();form.set('leadId','lead');form.set('commandId','command');form.set('orgId','forged');form.set('userId','forged');
 await queueAnalysisAction({message:''},form);
 expect(f.queue).toHaveBeenCalledWith(f.db,{orgId:'real-org',userId:'real-user'},'lead','command');
 expect(f.refresh).toHaveBeenCalledWith('/inteligencia');
});
