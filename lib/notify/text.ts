// One text per recipient, one `text_sent` event per text. Only US numbers are
// texted; an opted-out person gets only a code they asked for. Bodies, codes
// and links never reach an event.
import type { Q } from "../db";
import { writeEvent } from "../events";
import { isUsNumber } from "../phone";
import { issueMagicLink } from "../tokens";
import type { Person, Source } from "../types";
import * as copy from "./copy";
import type { Code, Dropped, MaybeNudge, Notifier, OnReached, OneMore } from "./index";

export type Kind = keyof Notifier;
export type Sent = { status: "sent"; sid: string | null } | { status: "failed"; error: string };
export type Transport = { channel: "log" | "sms"; send(to: string, body: string, kind: Kind): Promise<Sent> };

/** Twilio's error when the recipient has replied STOP. */
export const OPTED_OUT = "21610";

type Recipient = Pick<Person, "id" | "phone" | "name" | "show_name" | "sms_opt_out">;
type Outcome = Sent | { status: "skipped"; reason: "not_us" | "opted_out" };

export class TextNotifier implements Notifier {
  constructor(
    protected q: Q,
    private transport: Transport,
  ) {}

  private async people(ids: string[]): Promise<Map<string, Recipient>> {
    if (!ids.length) return new Map();
    const { rows } = await this.q.query<Recipient>(
      "select id, phone, name, show_name, sms_opt_out from person where id = any($1)", [ids]);
    return new Map(rows.map((r) => [r.id, r]));
  }

  /** A fresh single-use sign-in link to the proposal. */
  private link(personId: string, proposalId: string, source: Source): Promise<string> {
    return issueMagicLink(this.q, personId, `/p/${proposalId}`, source);
  }

  /** `body` runs only when the text will go, so a skipped person gets no token. */
  private async deliver(kind: Kind, boardId: string | null, proposalId: string | null, p: Recipient | undefined, body: () => string | Promise<string>): Promise<boolean> {
    if (!p) return false;
    const skip = !isUsNumber(p.phone) ? "not_us" : p.sms_opt_out && kind !== "code" ? "opted_out" : null;
    const out: Outcome = skip ? { status: "skipped", reason: skip } : await this.transport.send(p.phone, await body(), kind);
    if (out.status === "failed" && out.error === OPTED_OUT) {
      await this.q.query("update person set sms_opt_out = true where id = $1", [p.id]);
    } else if (out.status === "sent" && kind === "code" && p.sms_opt_out) {
      // They texted START since; a code that went through proves it.
      await this.q.query("update person set sms_opt_out = false where id = $1", [p.id]);
    }
    await writeEvent(this.q, {
      boardId, proposalId, personId: p.id, type: "text_sent", source: "direct",
      data: { channel: this.transport.channel, kind, ...out },
    });
    return out.status === "sent";
  }

  async onReached(m: OnReached) {
    const ps = await this.people([...m.yeses, ...m.maybes]);
    const n = m.yeses.length;
    const missed = new Set(m.cantMakeIt);
    await Promise.all([
      ...m.yeses.map((id) => this.deliver("onReached", m.boardId, m.proposalId, ps.get(id), async () => {
        const link = await this.link(id, m.proposalId, "on_text");
        if (!m.onDay) return copy.onNoDayText(m.title, n, link);
        return missed.has(id) ? copy.onMissedText(m.title, m.onDay, n, link) : copy.onText(m.title, m.onDay, m.timeText, n, link);
      })),
      ...m.maybes.map((id) => this.deliver("maybeNudge", m.boardId, m.proposalId, ps.get(id), async () =>
        copy.maybeText(m.title, n, await this.link(id, m.proposalId, "maybe_nudge")))),
    ]);
  }

  async maybeNudge(m: MaybeNudge) {
    const ps = await this.people(m.to);
    await Promise.all(m.to.map((id) => this.deliver("maybeNudge", m.boardId, m.proposalId, ps.get(id), async () =>
      copy.maybeText(m.title, m.count, await this.link(id, m.proposalId, "maybe_nudge")))));
  }

  /** Meant to be forwarded, so a share link and never a sign-in token. */
  async oneMore(m: OneMore) {
    const ps = await this.people(m.to.map((r) => r.personId));
    await Promise.all(m.to.map((r) => this.deliver("oneMore", m.boardId, m.proposalId, ps.get(r.personId), () =>
      copy.oneMoreText(m.count, m.min, m.title, r.url))));
  }

  async dropped(m: Dropped) {
    const ps = await this.people([m.to, m.who]);
    const who = ps.get(m.who);
    await this.deliver("dropped", m.boardId, m.proposalId, ps.get(m.to), async () =>
      copy.dropText(who?.show_name ? who.name : null, m.title, m.count, await this.link(m.to, m.proposalId, "on_text")));
  }

  async code(m: Code) {
    const ps = await this.people([m.personId]);
    return { sent: await this.deliver("code", m.boardId, null, ps.get(m.personId), () => copy.codeText(m.code)) };
  }
}

/** No texts: each would-be text is one log line (with its body, so local sign-in works) and one event of channel `log`. */
export class LogNotifier extends TextNotifier {
  constructor(q: Q, log: (line: string) => void = (l) => console.log(l)) {
    super(q, {
      channel: "log",
      async send(to, body, kind) {
        log(JSON.stringify({ notify: kind, to, body }));
        return { status: "sent", sid: null };
      },
    });
  }
}
