import {test,expect,vi} from 'vitest';
import {testDb,seedOrg} from './helpers';
import {claimVoiceRegistration,saveVoiceProfile,listVoiceJobs,queueVoiceDelivery} from '@/lib/voice/delivery';
import {schema} from '@/db';
import {and,eq} from 'drizzle-orm';

/**
 * Voz na DEMONSTRACAO: quem apresenta precisa conseguir GRAVAR a propria voz
 * dentro do ambiente de demonstracao (sem enviar nada a ninguem).
 */
test('demo allows recording the seller voice but never delivery',async()=>{
 const db=await testDb();
 const a=await seedOrg(db,'Voice Demo');
 const demo=await db.update(schema.orgs).set({isDemo:true}).where(eq(schema.orgs.id,a.org.id)).returning();
 const scope={orgId:demo[0].id,userId:a.user.id};

 // cadastro liberado na demo
 await claimVoiceRegistration(db,scope);
 await saveVoiceProfile(db,scope,'abcd1234','moss-tts-nano',true);
 const [profile]=await db.select().from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId)));
 expect(profile).toBeTruthy();
 expect(profile!.enabled).toBe(true);

 // leitura da fila liberada na demo
 await expect(listVoiceJobs(db,scope,{allowDemo:true})).resolves.toEqual([]);

 // envio continua BLOQUEADO na demo (nada sai para numero real)
 await expect(queueVoiceDelivery(db,scope,{id:crypto.randomUUID(),recipient:'5511999999999',text:'ola',kind:'audio'})).rejects.toThrow();
});

test('recording the same voice again replaces the previous profile of that user',async()=>{
 const db=await testDb();
 const a=await seedOrg(db,'Voice Troca');
 const scope={orgId:a.org.id,userId:a.user.id};
 await saveVoiceProfile(db,scope,'aaaa1111','moss-tts-nano',true);
 await saveVoiceProfile(db,scope,'bbbb2222','moss-tts-nano',true);
 const rows=await db.select().from(schema.voiceProfiles).where(and(eq(schema.voiceProfiles.orgId,scope.orgId),eq(schema.voiceProfiles.userId,scope.userId)));
 expect(rows).toHaveLength(1);
 expect(rows[0].externalId).toBe('bbbb2222');
});
