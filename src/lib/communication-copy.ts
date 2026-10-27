export type CommunicationContext={quadrant:'D'|'I'|'S'|'C';evidenceLabel:'declared'|'estimate';tone:string;format:string;preferredFormat:string};
export function communicationQuestion(kind:'priority'|'process'|'permission',context?:CommunicationContext){
 const defaults={priority:'Qual é a prioridade da sua equipe hoje?',process:'Como vocês organizam esse processo hoje?',permission:'Faz sentido conversarmos sobre esse tema?'};
 if(!context||kind==='process')return defaults[kind];
 const questions={
  D:{priority:'Qual resultado vocês querem priorizar agora?',permission:'Posso apresentar uma próxima ação objetiva sobre esse tema?'},
  I:{priority:'Que oportunidade você gostaria de explorar com sua equipe?',permission:'Podemos trocar uma ideia breve sobre esse tema?'},
  S:{priority:'O que ajudaria sua equipe a avançar com mais tranquilidade?',permission:'Posso explicar esse tema para você avaliar com calma?'},
  C:{priority:'Quais critérios e informações você precisa para avaliar esse tema?',permission:'Posso apresentar os critérios e detalhes para sua avaliação?'},
 };
 return questions[context.quadrant][kind];
}
export function commercialMessage(intro:string,offer:string,question:string,context?:CommunicationContext){
 if(context?.preferredFormat==='bullets')return `${intro}\n\n• ${offer}\n• ${question}`;
 if(context?.quadrant==='C')return `${intro}\n\n${offer}\n\n${question}`;
 return `${intro} ${offer} ${question}`;
}
