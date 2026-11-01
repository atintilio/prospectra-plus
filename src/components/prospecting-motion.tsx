import Image from 'next/image';

/** Elemento decorativo: representa sinais, contexto e decisão humana sem simular dados de produto. */
export function ProspectingMotion() {
  return (
    <div className="prospecting-motion" aria-hidden="true">
      <span className="prospecting-motion-aura" />
      <span className="prospecting-orbit prospecting-orbit--one"><i className="prospecting-orbit-node" /></span>
      <span className="prospecting-orbit prospecting-orbit--two"><i className="prospecting-orbit-node" /></span>
      <span className="prospecting-orbit prospecting-orbit--three" />
      <span className="prospecting-motion-center">
        <Image
          src="/prospectra-mark-optimized.webp"
          alt=""
          fill
          sizes="(max-width: 760px) 140px, (max-width: 1200px) 250px, 360px"
          className="prospecting-logo-spin-360 object-contain drop-shadow-[0_12px_40px_rgba(74,127,255,.42)]"
        />
      </span>
      <span className="prospecting-signal prospecting-signal--intent"><i /> Sinal de mercado</span>
      <span className="prospecting-signal prospecting-signal--context"><i /> Contexto da conta</span>
      <span className="prospecting-signal prospecting-signal--human"><i /> Você no comando</span>
    </div>
  );
}
