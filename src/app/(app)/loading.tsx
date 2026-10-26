export default function Loading(){
 return <div className="prospectra-loading space-y-6" role="status" aria-label="Carregando página">
  <span className="sr-only">Carregando página</span>
  <div aria-hidden="true" className="h-8 w-48 rounded-lg bg-surface"/>
  <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2"><div className="h-32 rounded-2xl bg-surface"/><div className="h-32 rounded-2xl bg-surface"/></div>
  <div aria-hidden="true" className="h-64 rounded-2xl bg-surface"/>
 </div>;
}
