import 'server-only';
import {createHmac} from 'node:crypto';
export function sessionWebhookSecret(master:string,sessionId:string){
 if(master.length<32)throw Error('WEBHOOK_NOT_CONFIGURED');
 return createHmac('sha256',master).update('prospectra-whatsapp:'+sessionId).digest('hex');
}
