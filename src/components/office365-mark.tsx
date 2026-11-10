export function Office365Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="shrink-0">
      <path fill="#F35325" d="M2 2h9v9H2z" />
      <path fill="#81BC06" d="M13 2h9v9h-9z" />
      <path fill="#05A6F0" d="M2 13h9v9H2z" />
      <path fill="#FFBA08" d="M13 13h9v9h-9z" />
    </svg>
  );
}
