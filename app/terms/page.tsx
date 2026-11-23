import type { Metadata } from "next";
import Link from "next/link";
import { Legal, type LegalPart } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms · Loopd" };

const PARTS: LegalPart[] = [
  { id: "pilot", name: "The pilot", short: "A free pilot.",
    full: <>Loopd is a free pilot that connects the AI assistants your group already uses to one shared plan.</> },
  { id: "save", name: "What you save", short: "You answer for what you save.",
    full: <>You are responsible for what you save to a team, whether you write it or your assistant saves it for you. Upload only files you are allowed to share with that team. Do not post anything unlawful, or anything about someone that they would not want shared with the team. The people who manage a team can remove members, and we may remove content or teams that break these terms.</> },
  { id: "assistant", name: "Your assistant", short: "It acts for you, and it can be wrong.",
    full: <>When you connect an assistant, you let it read and save to the teams you grant it, on your behalf. Its answers come from what your team saved, and it can still get things wrong. Check anything that matters, like a deadline or a file version, against the source it links to.</> },
  { id: "texts", name: "Texts", short: "One text: your sign‑in code.",
    full: <>On the cohort trip board, when you enter your mobile number, we text it a sign-in code to confirm it is yours. That is the only text Loopd sends. No marketing. Msg &amp; data rates may apply. Carriers are not liable for delayed or undelivered messages. US numbers only for now.</> },
  { id: "none", name: "No guarantees", short: "As is. It may change or stop.",
    full: <>Loopd is provided as is, and as a pilot it may change or stop. It keeps track of a plan; it does not do the work, book, pay for, or guarantee anything.</> },
  { id: "info", name: "Your information", short: "What we keep is in Privacy.",
    full: <>See <Link href="/privacy">Privacy</Link>. Questions: <a href="mailto:xwf2@cornell.edu">xwf2@cornell.edu</a>.</> },
];

export default function Terms() {
  return <Legal title="Terms" updated="November 23, 2026" gist="What you agree to when you use Loopd." parts={PARTS} />;
}
