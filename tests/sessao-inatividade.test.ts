import {test,expect} from 'vitest';
import {minutosInatividade, segundosRestantes, MINUTOS_INATIVIDADE_PADRAO, AVISO_MINUTOS_PADRAO} from '@/lib/session-idle';

test('sessao encerra depois de 15 minutos sem uso (padrao do dono)',()=>{
 expect(MINUTOS_INATIVIDADE_PADRAO).toBe(15);
 expect(minutosInatividade(undefined)).toBe(15);
 expect(minutosInatividade('')).toBe(15);
 expect(minutosInatividade('abc')).toBe(15);
 expect(minutosInatividade('0')).toBe(15);
 expect(minutosInatividade('-5')).toBe(15);
});

test('o tempo de inatividade e configuravel, com teto de 24 horas',()=>{
 expect(minutosInatividade('45')).toBe(45);
 expect(minutosInatividade('30')).toBe(30);
 expect(minutosInatividade('100000')).toBe(24*60);
});

test('o aviso aparece antes do fim e some antes disso',()=>{
 const limite=15*60_000, aviso=AVISO_MINUTOS_PADRAO*60_000;
 // ainda usando: sem aviso
 expect(segundosRestantes(0,limite,aviso)).toBeNull();
 expect(segundosRestantes(aviso-1000,limite,aviso)).toBeNull();
 // 2 minutos de aviso: mostra os segundos que faltam
 expect(segundosRestantes(aviso,limite,aviso)).toBe(limite-aviso > 0 ? Math.ceil((limite-aviso)/1000) : 1);
 expect(segundosRestantes(aviso+30_000,limite,aviso)).toBe(Math.ceil((limite-aviso-30_000)/1000));
});
