// Página de conferência das três variações da tela de ambiente.
//
// TEMPORÁRIA: existe só para o dono comparar as três lado a lado antes de escolher.
// Nenhuma delas está no ar — a tela ativa continua em `src/app/ambiente/page.tsx`.
// Remover esta pasta depois da escolha (ver `docs/guia/06-tela-de-ambiente.md`).
import VarianteA from '@/app/ambiente/_variante-a';
import VarianteB from '@/app/ambiente/_variante-b';
import VarianteC from '@/app/ambiente/_variante-c';

export const dynamic = 'force-dynamic';

export default async function PreviewVariantes() {
  return (
    <>
      <VarianteA />
      <VarianteB env="prod" />
      <VarianteC />
    </>
  );
}
