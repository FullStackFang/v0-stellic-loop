import Link from "next/link";
import type { ReactNode } from "react";
import { windowLabel } from "@/lib/days";
import type { Board } from "@/lib/types";
import { ToastProvider } from "./Toast";

/** Wordmark header, the screen, and the Board / Post / You bar. */
export function Shell({ board, tab, children }: { board: Board; tab: "board" | "new" | "you" | null; children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="app">
        <header className="head">
          <Link className="wordmark" href={`/b/${board.slug}`}>Quorum</Link>
          <span className="meta">{board.name} · {windowLabel(board.window_start, board.window_end)}</span>
        </header>
        <main className="screen">{children}</main>
        <nav className="tabbar" aria-label="Board">
          <Link className={tab === "board" ? "on" : ""} href={`/b/${board.slug}`} aria-current={tab === "board" ? "page" : undefined}>Board</Link>
          <Link className={tab === "new" ? "on" : ""} href={`/b/${board.slug}/new`} aria-current={tab === "new" ? "page" : undefined}>Post</Link>
          <Link className={tab === "you" ? "on" : ""} href={`/b/${board.slug}/you`} aria-current={tab === "you" ? "page" : undefined}>You</Link>
        </nav>
      </div>
    </ToastProvider>
  );
}
