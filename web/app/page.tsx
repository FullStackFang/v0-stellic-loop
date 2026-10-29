export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="pls-raised flex w-full max-w-sm flex-col gap-6 p-8">
        <div className="flex flex-col gap-2">
          <span className="pls-kicker">Loop</span>
          <h1 className="pls-display text-4xl font-bold leading-tight">Loop</h1>
          <p className="text-secondary text-base">The people you show up with.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="pls-btn pls-btn--primary">
            Tap in
          </button>
          <button type="button" className="pls-btn pls-btn--ghost">
            Not this week
          </button>
        </div>
      </section>
    </main>
  );
}
