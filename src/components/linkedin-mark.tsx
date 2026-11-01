// Marca oficial do LinkedIn.
//
// Vetor oficial da marca (o "in" branco sobre o quadrado azul). Não redesenhar o
// logotipo e não recolorir fora do azul oficial: a regra do PRD é exibir o símbolo
// como ele é, na cor #0A66C2.
//
// Fonte do vetor: arquivo oficial da marca (o mesmo traçado disseminado pelos
// ícones da marca em Products/Services e pelas bibliotecas de ícones), viewBox 24x24.

/** Cor oficial da marca LinkedIn. */
export const LINKEDIN_BRAND_COLOR = '#0A66C2';

/** Traçados oficiais do glifo "in" (viewBox 24x24). */
const MARK_GLYPH = {
  // ponto + haste do "i"
  i: 'M5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452z',
  // letra "n"
  n: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286z',
};

/**
 * Símbolo do LinkedIn: quadrado arredondado azul (#0A66C2) com o "in" branco.
 * Use `size` em pixels e `className` para alinhar na interface.
 */
export function LinkedInMark({
  className,
  size = 20,
  title = 'LinkedIn',
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: 'middle' }}
    >
      <rect width="24" height="24" rx="2" fill={LINKEDIN_BRAND_COLOR} />
      <path fill="#FFFFFF" d={MARK_GLYPH.i} />
      <path fill="#FFFFFF" d={MARK_GLYPH.n} />
    </svg>
  );
}

export default LinkedInMark;
