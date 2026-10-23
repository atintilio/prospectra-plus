import { beforeEach, expect, test, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/db';
import { requireAdmin } from '@/lib/auth';
import { seedOrg, testDb } from './helpers';
import { saveAdminUserAction, adminStatusAction } from '@/app/(app)/admin/user-actions';
import { canChangeUser } from '@/lib/admin-policy';
vi.mock('@/db', async () => ({...await vi.importActual('@/db'),getDb:vi.fn()}));
vi.mock('@/lib/auth',()=>({requireAdmin:vi.fn(),normalizeEmail:(s:string)=>s.trim().toLowerCase(),issueAccessLink:vi.fn(async()=> 'https://example.test/access')}));
vi.mock('@/lib/mailer',()=>({sendAccessEmail:vi.fn(async()=>{})}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
let db: Awaited<ReturnType<typeof testDb>>; let orgId:string; let masterId:string;
beforeEach(async()=>{db=await testDb();const {org,user}=await seedOrg(db);orgId=org.id;masterId=user.id;vi.mocked(getDb).mockResolvedValue(db);vi.mocked(requireAdmin).mockResolvedValue({user:{...user,email:'atintilio@argusprime.com.br',platformRole:'admin'},org,role:'owner',sessionId:'test'});});
function form(id?:string){const f=new FormData();Object.entries({name:'Pessoa',email:'pessoa@example.test',orgId,role:'sdr',platformRole:'user',...(id?{id}: {})}).forEach(([k,v])=>f.set(k,v));return f;}
test('master creates account and edits membership and platform permissions',async()=>{expect((await saveAdminUserAction(undefined,form()))?.ok).toBeTruthy();const [u]=await db.select().from(schema.users).where(eq(schema.users.email,'pessoa@example.test'));expect(u.status).toBe('invited');const f=form(u.id);f.set('role','manager');f.set('platformRole','admin');expect((await saveAdminUserAction(undefined,f))?.ok).toBeTruthy();expect((await db.select().from(schema.memberships).where(eq(schema.memberships.userId,u.id)))[0].role).toBe('manager');expect((await db.select().from(schema.users).where(eq(schema.users.id,u.id)))[0].platformRole).toBe('admin');});
test('deactivation revokes sessions and invalidates outstanding access links, retaining user data',async()=>{const [u]=await db.insert(schema.users).values({email:'active@example.test',status:'active',passwordHash:'retained'}).returning();await db.insert(schema.sessions).values({id:'session',userId:u.id,expiresAt:new Date(Date.now()+60000)});await db.insert(schema.authTokens).values({id:'invite',kind:'reset',userId:u.id,expiresAt:new Date(Date.now()+60000)});expect((await adminStatusAction(u.id,'disabled'))?.ok).toBeTruthy();expect((await db.select().from(schema.users).where(eq(schema.users.id,u.id)))[0].passwordHash).toBe('retained');expect(await db.select().from(schema.sessions)).toHaveLength(0);expect((await db.select().from(schema.authTokens))[0].usedAt).toBeTruthy();});
test('secondary administrator cannot change primary or itself',()=>{const actor={id:'moises',email:'mloro@argusprime.com.br',platformRole:'admin'};expect(canChangeUser(actor,{id:masterId,email:'atintilio@argusprime.com.br'})).toBe(false);expect(canChangeUser(actor,{id:'moises',email:actor.email})).toBe(false);expect(canChangeUser(actor,{id:'other',email:'other@example.test'})).toBe(true);});
test('unauthorized request fails before any write',async()=>{vi.mocked(requireAdmin).mockRejectedValueOnce(new Error('unauthorized'));await expect(saveAdminUserAction(undefined,form())).rejects.toThrow('unauthorized');expect(await db.select().from(schema.users)).toHaveLength(1);});
