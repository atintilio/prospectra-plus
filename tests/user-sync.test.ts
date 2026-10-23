import { expect,test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { syncUsers } from '../scripts/user-sync.mjs';
import { readFile } from 'node:fs/promises';
test('batch migration imports active users together, preserves existing passwords and blocked accounts, and is idempotent',async()=>{
 const db=new PGlite();try {await db.exec(await readFile('drizzle/0000_init.sql','utf8'));await db.exec(await readFile('drizzle/0001_demo.sql','utf8'));
 const query=async(s:string,p:unknown[]) => (await db.query<Record<string,any>>(s,p)).rows;
 await query("insert into orgs(name) values ('Argus Prime')",[]);
 await query("insert into users(email,status,password_hash) values ('blocked@example.test','disabled','current'),('existing@example.test','active','new-password')",[]);
 const users=[{email:'mloro@argusprime.om.br',active:true,passwordHash:'old-hash',role:'admin'},{email:'existing@example.test',passwordHash:'old-password'},{email:'blocked@example.test',passwordHash:'old-password'},{email:'cancelled@example.test',active:false},{email:'demo@example.test',workspaceMode:'demo',passwordHash:'demo-hash'}];
 expect(await syncUsers(query,users)).toBe(2);expect(await syncUsers(query,users)).toBe(0);
 expect((await query('select * from users where email=$1',['mloro@argusprime.com.br']))[0].platform_role).toBe('admin');
 expect((await query('select * from users where email=$1',['existing@example.test']))[0].password_hash).toBe('new-password');
 expect((await query('select * from users where email=$1',['blocked@example.test']))[0].status).toBe('disabled');
 expect(await query('select * from users where email=$1',['cancelled@example.test'])).toHaveLength(0);
 expect(await query("select m.* from memberships m join users u on u.id=m.user_id where u.email='demo@example.test'",[])).toHaveLength(0);
 } finally {await db.close();}
});
