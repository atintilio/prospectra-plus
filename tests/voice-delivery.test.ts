import {test,expect,vi} from 'vitest';
import {testDb,seedOrg} from './helpers';
import {saveVoiceProfile,queueVoiceDelivery,executeVoiceDelivery,claimVoiceRegistration} from '@/lib/voice/delivery';
import {schema} from '@/db';
import {eq} from 'drizzle-orm';
test('automatic audio uses only the seller profile and a persistent outbound receipt',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Voice A'),b=await seedOrg(db,'Voice B');
 const scope={orgId:a.org.id,userId:a.user.id};
 await saveVoiceProfile(db,scope,'abcd1234','engine',true);
 const job=await queueVoiceDelivery(db,scope,{id:crypto.randomUUID(),recipient:'5511999999999',text:'Olá',kind:'audio'});
 const generate=vi.fn(async()=>new Blob(['OggSOpusHead'],{type:'audio/ogg'})),send=vi.fn(async()=>({providerMessageId:'voice-id'}));
 expect(await executeVoiceDelivery(db,job.id,scope,{engineId:'engine',generate},send)).toBe('sent');
 expect(await executeVoiceDelivery(db,job.id,scope,{engineId:'engine',generate},send)).toBe('sent');
 expect(generate).toHaveBeenCalledTimes(1);expect(send).toHaveBeenCalledTimes(1);
 await expect(executeVoiceDelivery(db,job.id,{orgId:b.org.id,userId:b.user.id},{engineId:'engine',generate},send)).rejects.toThrow();
});
test('voice registration has a server-side limit before any upstream upload',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Voice Limit');const scope={orgId:a.org.id,userId:a.user.id};
 for(let i=0;i<5;i++)await claimVoiceRegistration(db,scope);
 await expect(claimVoiceRegistration(db,scope)).rejects.toThrow('Limite');
});
test('calls wait for a real transport and revoked voice consent blocks audio before generation',async()=>{
 const db=await testDb(),a=await seedOrg(db,'Voice C');const scope={orgId:a.org.id,userId:a.user.id};
 await saveVoiceProfile(db,scope,'abcd1234','engine',true);
 const call=await queueVoiceDelivery(db,scope,{id:crypto.randomUUID(),recipient:'5511999999999',text:'Introdução',kind:'call'});
 const generate=vi.fn(),send=vi.fn();
 expect(call.state).toBe('waiting_transport');
 expect(await executeVoiceDelivery(db,call.id,scope,{engineId:'engine',generate},send)).toBe('waiting_transport');
 const audio=await queueVoiceDelivery(db,scope,{id:crypto.randomUUID(),recipient:'5511999999999',text:'Olá',kind:'audio'});
 await db.update(schema.voiceProfiles).set({enabled:false}).where(eq(schema.voiceProfiles.orgId,scope.orgId));
 await expect(executeVoiceDelivery(db,audio.id,scope,{engineId:'engine',generate},send)).rejects.toThrow();
 expect(generate).not.toHaveBeenCalled();expect(send).not.toHaveBeenCalled();
});
