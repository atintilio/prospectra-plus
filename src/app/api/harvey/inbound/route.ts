import {getDb} from '@/db';
import {after} from 'next/server';
import {ingestHarveyWebhook,processHarveyInbound} from '@/lib/harvey-webhooks';
import {runHarveyQueue} from '@/lib/harvey-operations';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(req:Request){
 const body=await req.text();
 if(body.length>128000)return new Response('payload too large',{status:413});
 try{
  const db=await getDb();
  const result=await ingestHarveyWebhook(db,body,req.headers.get('x-webhook-signature'),process.env.HARVEY_WEBHOOK_SECRET);
  if('received' in result)after(async()=>{
   try{await processHarveyInbound(db);await runHarveyQueue(db,{maxJobs:1});}
   catch{console.error('Commercial processing deferred to durable queue.');}
  });
  return Response.json(result);
 }
 catch(error){const code=error instanceof Error?error.message:'';return new Response('callback unavailable',{status:code==='WEBHOOK_UNAUTHORIZED'||code==='WEBHOOK_EXPIRED'?401:code==='WEBHOOK_INVALID'?400:503});}
}
