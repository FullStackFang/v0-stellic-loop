export function Sect({ lab, n, plain }: { lab: string; n?: number; plain?: string }) {
  return <div className="sec"><span>{lab}</span>{plain ? <span>{plain}</span> : n !== undefined ? <span>{n}</span> : null}</div>;
}
export const Arrow = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
export const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;
