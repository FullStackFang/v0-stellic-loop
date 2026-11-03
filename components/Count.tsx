export function Count({ count, threshold, lead }: { count: number; threshold: number; lead: string }) {
  return <><div className="count" aria-live="polite"><span className="big">{count}</span><span className="of">of {threshold}<small>{lead}</small></span></div><div className="bars" aria-hidden="true">{Array.from({ length: threshold }, (_, i) => <b key={i} className={i < count ? "f" : ""} />)}</div></>;
}
