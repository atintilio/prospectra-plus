// Popula um banco LOCAL (PGlite) com dados de exemplo para desenvolvimento. Nunca usar em produção.
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '../src/db/schema';
import { hashPassword } from '../src/lib/crypto';
import { enrollLeads, completeAction, markOutcome, runScheduler } from '../src/lib/cadence';
const db = drizzle(new PGlite(process.argv[2] ?? './.data/dev'), { schema });
await migrate(db, { migrationsFolder: 'drizzle' });
const [u] = await db.insert(schema.users).values({ email: 'teste@local', name: 'André Tintilio', platformRole: 'admin', status: 'active', passwordHash: await hashPassword('senha-de-teste-123') }).returning();
const [o] = await db.insert(schema.orgs).values({ name: 'Argus Prime (teste local)' }).returning();
await db.insert(schema.memberships).values({ orgId: o.id, userId: u.id, role: 'owner' });
const names = ['Renata Costa','Marcos Lima','Ana Souza','Pedro Alves','Juliana Martins','Carla Souza','Felipe Almeida','Lucas Ferreira','Mariana Rocha','Bruno Teixeira','Paula Nunes','Rafael Oliveira'];
const comps = ['TechCorp','DataSoft','InnovaB2B','Metalúrgica Sul','Grupo Vale Verde','Transportes Rota'];
const leads = await db.insert(schema.leads).values(names.map((n,i)=>({orgId:o.id, ownerId:u.id, linkedinUrl:`https://www.linkedin.com/in/${n.toLowerCase().replace(/\s/g,'-')}`, fullName:n, headline:['CFO','Diretor Financeiro','Controller','Head de Tributário'][i%4], company:comps[i%6], tag:'CFOs SC'}))).returning();
const steps = [
 { id:'s1', type:'invite', delayDays:0, condition:'always', template:'Olá {nome}, acompanho o trabalho da {empresa} e gostaria de trocar ideias com você por aqui.', useAi:false },
 { id:'s2', type:'message', delayDays:1, condition:'accepted', template:'Obrigado por aceitar, {nome}! Como a {empresa} lida hoje com créditos tributários?', useAi:false },
] as schema.CampaignStep[];
const [c] = await db.insert(schema.campaigns).values({ orgId:o.id, ownerId:u.id, assignedTo:u.id, name:'CFOs indústria SC', status:'active', steps }).returning();
const now = Date.now();
await enrollLeads(db as any, o.id, c.id, leads.map(l=>l.id), new Date(now-10*86400e3));
await runScheduler(db as any, { now: new Date(now-10*86400e3) });
const acts = await db.select().from(schema.actions);
for (const [i,a] of acts.slice(0,8).entries()) await completeAction(db as any, o.id, u.id, a.id, 'done', undefined, new Date(now-(9-i)*86400e3));
for (const l of leads.slice(0,5)) await markOutcome(db as any, o.id, u.id, l.id, 'accepted', new Date(now-4*86400e3));
await runScheduler(db as any, { now: new Date(now-3*86400e3) });
const m = (await db.select().from(schema.actions)).filter(a=>a.status==='pending'&&a.type==='message');
for (const a of m.slice(0,3)) await completeAction(db as any, o.id, u.id, a.id, 'done', undefined, new Date(now-2*86400e3));
await markOutcome(db as any, o.id, u.id, leads[0].id, 'replied', new Date(now-86400e3));
await markOutcome(db as any, o.id, u.id, leads[1].id, 'meeting', new Date(now-3600e3));
console.log('seeded', acts.length);
process.exit(0);
