import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../server/api/_lib/access',()=>({requireActiveSession:vi.fn(),requireSameOrigin:vi.fn()}));
vi.mock('../server/integrations/linkedin-login',()=>({linkedinLogin:vi.fn()}));
import handler from '../server/api/integrations/linkedin/connect';
import { requireActiveSession, requireSameOrigin } from '../server/api/_lib/access';
import { linkedinLogin } from '../server/integrations/linkedin-login';
function response(){ const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);return res; }
afterEach(()=>vi.resetAllMocks());
describe('LinkedIn connection API',()=>{
 it('does not contact gateway without a valid session',async()=>{vi.mocked(requireActiveSession).mockResolvedValue(null);await handler({method:'POST'} as any,response());expect(linkedinLogin).not.toHaveBeenCalled();});
 it('blocks demonstration users',async()=>{vi.mocked(requireActiveSession).mockResolvedValue({user:{id:'demo',workspaceMode:'demo'}} as any);const res=response();await handler({method:'POST'} as any,res);expect(res.status).toHaveBeenCalledWith(403);expect(linkedinLogin).not.toHaveBeenCalled();});
 it('blocks cross-origin mutations',async()=>{vi.mocked(requireActiveSession).mockResolvedValue({user:{id:'alice'}} as any);vi.mocked(requireSameOrigin).mockReturnValue(false);await handler({method:'POST'} as any,response());expect(linkedinLogin).not.toHaveBeenCalled();});
 it('uses server session identity even if a different user ID is submitted',async()=>{vi.mocked(requireActiveSession).mockResolvedValue({user:{id:'alice'}} as any);vi.mocked(requireSameOrigin).mockReturnValue(true);vi.mocked(linkedinLogin).mockResolvedValue({status:'starting'});await handler({method:'POST',body:{userId:'bob'}} as any,response());expect(linkedinLogin).toHaveBeenCalledWith('alice','POST');});
});
