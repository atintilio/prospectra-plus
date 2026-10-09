import { expect, it } from 'vitest';
import { seedState } from '../src/data';
import { migrateWorkspace, setCustomValue, reviewProposal, recordChannelEvent, validateExtension, saveCRM } from '../src/crm/merge';
it('preserva o estado completo e produz uma cópia independente', () => {
 const crm = migrateWorkspace(seedState); expect(crm.legacy).toEqual(seedState);
 crm.legacy.accounts[0].name = 'Alterado'; expect(seedState.accounts[0].name).not.toBe('Alterado');
});
it('rejeita IDs duplicados antes de migrar', () => {
 const state = structuredClone(seedState); state.accounts.push(state.accounts[0]); expect(() => migrateWorkspace(state)).toThrow();
});
it('valida o tipo e a existência do registro para campos personalizados', () => {
 const crm = migrateWorkspace(seedState); crm.fields.push({id:'size',label:'Porte',entity:'account',type:'number'});
 expect(setCustomValue(crm,'size',crm.legacy.accounts[0].id,25).values[crm.legacy.accounts[0].id].size).toBe(25);
 expect(() => setCustomValue(crm,'size','inexistente',25)).toThrow();
 expect(() => setCustomValue(crm,'size',crm.legacy.accounts[0].id,'25')).toThrow();
});
it('exige evidência e não aplica sugestões automaticamente', () => {
 const crm = migrateWorkspace(seedState); const contact = crm.legacy.accounts[0].contacts[0];
 crm.proposals.push({id:'p',contactId:contact.id,field:'role',value:'Diretoria',sourceUrl:'https://example.org/equipe',observedAt:'2026-10-09T12:00:00Z',evidence:'Cargo publicado na equipe',status:'proposed'});
 const updated = reviewProposal(crm,'p','applied'); expect(updated.legacy.accounts[0].contacts[0].role).toBe('Diretoria'); expect(contact.role).not.toBe('Diretoria');
 expect(updated.legacy.accounts[0].contacts[0].status).toBe('A revisar');
 crm.proposals[0].evidence=''; expect(() => reviewProposal(crm,'p','applied')).toThrow();
});
it('deduplica respostas e preserva tarefas concluídas', () => {
 const crm=migrateWorkspace(seedState); const task=crm.legacy.campaigns[0].tasks[0];
 const event={id:'e',provider:'graph',providerEventId:'evt1',accountId:task.accountId,channel:'Email' as const,kind:'reply' as const,occurredAt:'2026-10-09T12:00:00Z'};
 const updated=recordChannelEvent(crm,event); expect(recordChannelEvent(updated,event)).toBe(updated);
 expect(updated.legacy.campaigns[0].tasks.filter(t=>t.accountId===task.accountId).every(t=>t.state==='Pausado'||t.state==='Concluído')).toBe(true);
});

it('exige nova aprovação depois de alterar um contato', () => {
 const crm=migrateWorkspace(seedState); const task=crm.legacy.campaigns[0].tasks[0];
 task.state='Aprovado'; task.approval={copyRevision:1,contactId:task.contactId,channel:task.channel,evidenceIds:[],approvedAt:'2026-10-09T12:00:00Z'};
 crm.proposals.push({id:'p',contactId:task.contactId,field:'role',value:'Cargo atualizado',sourceUrl:'https://example.org/equipe',observedAt:'2026-10-09T12:00:00Z',evidence:'Cargo publicado',status:'proposed'});
 const updated=reviewProposal(crm,'p','applied');
 expect(updated.legacy.campaigns[0].tasks[0].state).toBe('Aguardando revisão'); expect(updated.legacy.campaigns[0].tasks[0].approval).toBeUndefined();
});

it('rejeita fonte inválida no servidor e campos com valor incompatível', () => {
 const crm=migrateWorkspace(seedState); const contact=crm.legacy.accounts[0].contacts[0];
 crm.proposals.push({id:'p',contactId:contact.id,field:'role',value:'Cargo',sourceUrl:'javascript:alert(1)',observedAt:'2026-10-09T12:00:00Z',evidence:'Fonte',status:'proposed'});
 expect(()=>validateExtension(saveCRM(crm))).toThrow('WORKSPACE_STATE_INVALID');
 crm.proposals=[]; crm.fields=[{id:'n',entity:'account',type:'number',label:'Número'}]; crm.values[crm.legacy.accounts[0].id]={n:'inválido'};
 expect(()=>validateExtension(saveCRM(crm))).toThrow('WORKSPACE_STATE_INVALID');
});
