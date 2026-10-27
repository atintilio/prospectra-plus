import {getDb} from '@/db';
import {processHarveyInbound} from '@/lib/harvey-webhooks';
import {runHarveyQueue} from '@/lib/harvey-operations';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.get('authorization')!==`Bearer ${secret}`)return new Response('unauthorized',{status:401});
 const db=await getDb();const inbox=await processHarveyInbound(db);const outbox=await runHarveyQueue(db,{maxJobs:1});
 return Response.json({inbox,outbox});
}
