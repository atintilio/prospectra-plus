import 'server-only';
import {z} from 'zod';

type Config={baseUrl:string;apiKey:string;engine:string};
const id=z.string().regex(/^[a-f0-9]{8}$/);
const textSchema=z.string().trim().min(1).max(2000);
export function voiceConfig():Config|null{
 const baseUrl=process.env.VOICESTUDIO_BASE_URL?.trim(),apiKey=process.env.VOICESTUDIO_API_KEY?.trim(),engine=process.env.VOICESTUDIO_ENGINE?.trim();
 return baseUrl&&apiKey&&engine?{baseUrl,apiKey,engine}:null;
}

/** Contrato privado do backend do arquivo VoiceStudio fornecido pelo proprietário.
 * Geração pode levar minutos: chamar somente de executor persistente, nunca de requisição web.
 * O chamador precisa resolver o perfil por vendedor/operação; não aceitar ID externo de formulário.
 */
export class VoiceStudioGateway {
 private base:string;
 get engineId(){return this.config.engine;}
 constructor(private config:Config,private fetcher:typeof fetch=fetch){
  const url=new URL(config.baseUrl);
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  const prefix=url.pathname.replace(/\/$/,'');
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||(prefix!==''&&!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix))||!config.apiKey.trim()||!config.engine.trim())throw Error('Configure o backend privado de voz e um motor revisado.');
  this.base=url.origin+prefix;
 }
 private async request(path:string,init:RequestInit={},timeout=25000){
  let response:Response;
  try{response=await this.fetcher(this.base+path,{...init,headers:{Authorization:`Bearer ${this.config.apiKey}`},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(timeout)});}
  catch{throw Error('Voice Studio indisponível ou sem confirmação. Nenhum envio foi confirmado.');}
  if(!response.ok){await response.body?.cancel();throw Error('Voice Studio recusou a operação. Verifique configuração, motor e acesso.');}
  return response;
 }
 private async bounded(response:Response,max=8_000_000){
  const reader=response.body?.getReader();if(!reader)throw Error('Áudio não recebido.');
  const chunks:Uint8Array[]=[];let total=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>max)throw Error('Áudio excede o limite permitido.');chunks.push(value);}}
  catch(error){await reader.cancel();throw error;}
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
 }
 async createProfile(input:{sellerName:string;reference:Blob;transcript:string;consent:boolean}):Promise<{profileId:string}>{
  if(input.consent!==true)throw Error('Confirme a autorização de uso da voz do vendedor.');
  const name=z.string().trim().min(1).max(120).parse(input.sellerName);
  const transcript=z.string().trim().min(1).max(4000).parse(input.transcript);
  if(!input.reference.size||input.reference.size>3_000_000||!['audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/mpeg','audio/mp4'].includes(input.reference.type.split(';')[0]))throw Error('Gravação de referência inválida.');
  const form=new FormData();form.set('name',name);form.set('kind','clone');form.set('engine',this.config.engine);form.set('ref_text',transcript);form.set('language','Portuguese');form.set('ref_audio',input.reference,'reference.'+({'audio/wav':'wav','audio/x-wav':'wav','audio/webm':'webm','audio/ogg':'ogg','audio/mpeg':'mp3','audio/mp4':'m4a'}[input.reference.type.split(';')[0]]));
  const response=await this.request('/profiles',{method:'POST',body:form});
  const data=JSON.parse(new TextDecoder().decode(await this.bounded(response,64000)));
  return {profileId:id.parse(data.id)};
 }
 async generate(input:{profileId:string;text:string;language?:string}):Promise<Blob>{
  const profileId=id.parse(input.profileId),text=textSchema.parse(input.text);
  const form=new FormData();form.set('profile_id',profileId);form.set('text',text);form.set('engine',this.config.engine);form.set('language',z.enum(['Portuguese']).parse(input.language??'Portuguese'));form.set('stream','false');
  // /generate devolve WAV binário com X-Audio-Id; não é JSON ou endpoint Twilio.
  const response=await this.request('/generate',{method:'POST',body:form},600000);
  const audioId=response.headers.get('X-Audio-Id');
  if(!id.safeParse(audioId).success||!response.headers.get('Content-Type')?.startsWith('audio/wav')||!['0',null].includes(response.headers.get('X-OmniVoice-Dropped-Chunks'))){await response.body?.cancel();throw Error('Geração incompleta ou áudio inválido.');}
  const wav=await this.bounded(response);
  if(new TextDecoder().decode(wav.slice(0,4))!=='RIFF')throw Error('Resposta de voz inválida.');
  const encoded=await this.request(`/audio/${audioId}.ogg`);
  if(!encoded.headers.get('Content-Type')?.startsWith('audio/ogg')){await encoded.body?.cancel();throw Error('Formato de áudio inválido.');}
  const ogg=await this.bounded(encoded);
  if(new TextDecoder().decode(ogg.slice(0,4))!=='OggS'||!new TextDecoder().decode(ogg.slice(0,4096)).includes('OpusHead'))throw Error('Áudio Opus inválido.');
  return new Blob([ogg.buffer as ArrayBuffer],{type:'audio/ogg'});
 }
}
