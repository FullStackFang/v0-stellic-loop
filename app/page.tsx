import { StartBoard } from "@/components/StartBoard";
import { db } from "@/lib/db";
import { viewer } from "@/lib/viewer";

export default async function Home() {
  const me = await viewer(db());
  return (
    <div className="app">
      <header className="head"><span className="wordmark">Quorum</span></header>
      <main className="screen">
        <div className="mast" style={{ paddingTop: 14 }}>
          <h2>Your group&apos;s <em>board</em></h2>
          <p>Open the link pinned in your group chat.</p>
        </div>
        <StartBoard signedIn={!!me} />
      </main>
    </div>
  );
}
