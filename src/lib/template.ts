type LeadLike = { fullName: string; headline: string; company: string; location: string };

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** Variáveis: {nome}, {nome_completo}, {cargo}, {empresa}, {cidade} */
export function fillTemplate(template: string, lead: LeadLike): string {
  return template
    .replaceAll('{nome}', firstName(lead.fullName))
    .replaceAll('{nome_completo}', lead.fullName)
    .replaceAll('{cargo}', lead.headline)
    .replaceAll('{empresa}', lead.company)
    .replaceAll('{cidade}', lead.location)
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}
