/**
 * Checagem de arquivo enviado por formulario.
 *
 * `instanceof File` NAO funciona no runtime do Cloudflare Workers: o objeto
 * do FormData vem de outro realm e a comparacao de prototype falha — a tela
 * recebia "arquivo invalido" mesmo com a gravacao anexada. Por isso a
 * validacao e feita pela FORMA do objeto, nao pela classe.
 */
export function arquivoDoFormulario(valor: FormDataEntryValue | null): File | null {
  if (!valor || typeof valor === 'string') return null;
  const possivel = valor as Partial<File> & { arrayBuffer?: unknown };
  if (typeof possivel.arrayBuffer !== 'function' || typeof possivel.size !== 'number') return null;
  return valor as File;
}
