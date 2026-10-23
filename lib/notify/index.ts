// Every message the product will ever send, named once. Slice 1 calls
// `onReached` and `code`; slice 2 adds a TwilioNotifier and the other triggers.
import type { Q } from "../db";
import { writeEvent } from "../events";

type Base = { boardId: string; proposalId: string; title: string; url: string };

export type OnReached = Base & {
  onDay: string | null;
  timeText: string | null;
  lockedBy: string;
  /** everyone in */
  yeses: string[];
  /** in, but their days did not include the locked day */
  cantMakeIt: string[];
  maybes: string[];
};
export type OneMore = Base & { to: string[]; count: number; min: number; day: string | null };
export type MaybeNudge = Base & { to: string[]; count: number };
export type Dropped = Base & { to: string; who: string; count: number };
export type Code = { boardId: string; personId: string; phone: string; code: string };
export type MagicLink = { boardId: string; personId: string; url: string };

export interface Notifier {
  onReached(m: OnReached): Promise<void>;
  oneMore(m: OneMore): Promise<void>;
  maybeNudge(m: MaybeNudge): Promise<void>;
  dropped(m: Dropped): Promise<void>;
  code(m: Code): Promise<void>;
  magicLink(m: MagicLink): Promise<void>;
}

/** Writes one structured log line and one `text_sent` event (channel `log`) per would-be message. */
export class LogNotifier implements Notifier {
  constructor(
    private q: Q,
    private log: (line: string) => void = (l) => console.log(l),
  ) {}

  private async send(kind: keyof Notifier, boardId: string, proposalId: string | null, to: string[], data: Record<string, unknown>) {
    this.log(JSON.stringify({ notify: kind, to, ...data }));
    // The code itself is never written to the event log.
    const { code: _code, ...safe } = data;
    void _code;
    await writeEvent(this.q, {
      boardId,
      proposalId,
      type: "text_sent",
      source: "direct",
      data: { channel: "log", kind, to, ...safe },
    });
  }

  onReached(m: OnReached) {
    return this.send("onReached", m.boardId, m.proposalId, m.yeses, {
      title: m.title, url: m.url, on_day: m.onDay, time: m.timeText, locked_by: m.lockedBy,
      cant_make_it: m.cantMakeIt, maybes: m.maybes,
    });
  }
  oneMore(m: OneMore) {
    return this.send("oneMore", m.boardId, m.proposalId, m.to, { title: m.title, url: m.url, count: m.count, min: m.min, day: m.day });
  }
  maybeNudge(m: MaybeNudge) {
    return this.send("maybeNudge", m.boardId, m.proposalId, m.to, { title: m.title, url: m.url, count: m.count });
  }
  dropped(m: Dropped) {
    return this.send("dropped", m.boardId, m.proposalId, [m.to], { title: m.title, url: m.url, who: m.who, count: m.count });
  }
  code(m: Code) {
    return this.send("code", m.boardId, null, [m.personId], { phone: m.phone, code: m.code });
  }
  magicLink(m: MagicLink) {
    return this.send("magicLink", m.boardId, null, [m.personId], { url: m.url });
  }
}

let factory: (q: Q) => Notifier = (q) => new LogNotifier(q);

export function notifier(q: Q): Notifier {
  return factory(q);
}

/** Tests swap in a spy. */
export function setNotifier(f: ((q: Q) => Notifier) | null) {
  factory = f ?? ((q) => new LogNotifier(q));
}
