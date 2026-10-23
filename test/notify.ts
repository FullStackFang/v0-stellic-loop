// Records every notifier call and still writes the LogNotifier's events.
import { LogNotifier, setNotifier, type Notifier } from "@/lib/notify";

export type Call = { kind: keyof Notifier; msg: Record<string, unknown> };

export function spyNotifier(): Call[] {
  const calls: Call[] = [];
  setNotifier((q) => {
    const real = new LogNotifier(q, () => {});
    const wrap = <K extends keyof Notifier>(kind: K) =>
      (async (msg: Record<string, unknown>) => {
        calls.push({ kind, msg });
        await (real[kind] as (m: unknown) => Promise<void>)(msg);
      }) as Notifier[K];
    return {
      onReached: wrap("onReached"),
      oneMore: wrap("oneMore"),
      maybeNudge: wrap("maybeNudge"),
      dropped: wrap("dropped"),
      code: wrap("code"),
      magicLink: wrap("magicLink"),
    };
  });
  return calls;
}
