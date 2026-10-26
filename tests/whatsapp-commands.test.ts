import {expect,test,vi} from 'vitest';
import {testDb,seedOrg} from './helpers';
import {sendWhatsAppCommand} from '@/lib/whatsapp/commands';
import {schema} from '@/db';
import {eq} from 'drizzle-orm';
test('persistent receipt prevents repeated sends, detects changed payload and blocks cross-operation command IDs',async()=>{
 const db=await testDb();const a=await seedOrg(db,'WA A'),b=await seedOrg(db,'WA B');
 const send=vi.fn(async()=>({providerMessageId:'id-1'}));
 const command={id:crypto.randomUUID(),recipient:'+5511999999999',text:'Olá'};
 const scope={orgId:a.org.id,userId:a.user.id};
 expect((await sendWhatsAppCommand(db,scope,command,40,send)).state).toBe('sent');
 expect((await sendWhatsAppCommand(db,scope,command,40,send)).state).toBe('sent');
 expect(send).toHaveBeenCalledTimes(1);
 await expect(sendWhatsAppCommand(db,scope,{...command,text:'Alterado'},40,send)).rejects.toThrow();
 await expect(sendWhatsAppCommand(db,{orgId:b.org.id,userId:b.user.id},command,40,send)).rejects.toThrow();
});
test('unconfirmed sends stay unknown across retry, and daily cap prevents a new call',async()=>{
 const db=await testDb();const a=await seedOrg(db,'WA C');const scope={orgId:a.org.id,userId:a.user.id};
 const send=vi.fn(async()=>{throw Error('timeout');});const command={id:crypto.randomUUID(),recipient:'+5511999999999',text:'Olá'};
 expect((await sendWhatsAppCommand(db,scope,command,1,send)).state).toBe('unknown');
 expect((await sendWhatsAppCommand(db,scope,command,1,send)).state).toBe('unknown');
 await expect(sendWhatsAppCommand(db,scope,{...command,id:crypto.randomUUID()},1,send)).rejects.toThrow('Limite diário');
 expect(send).toHaveBeenCalledTimes(1);
 expect((await db.select().from(schema.whatsappCommands))[0].state).toBe('unknown');
 await db.update(schema.users).set({status:'disabled'}).where(eq(schema.users.id,a.user.id));
 await expect(sendWhatsAppCommand(db,scope,{...command,id:crypto.randomUUID()},40,send)).rejects.toThrow();
});
