import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms · Loop" };

export default function Terms() {
  return (
    <Legal title="Terms" updated="November 12, 2026">
      <p>Loop is a free pilot that connects the AI assistants your group already uses to one shared plan. It is invitation only: use it with the teams you were invited to.</p>
      <p><strong>What you save.</strong> You are responsible for what you save to a team, whether you write it or your assistant saves it for you. Upload only files you are allowed to share with that team. Do not post anything unlawful, or anything about someone that they would not want shared with the team. The people who manage a team can remove members, and we may remove content or teams that break these terms.</p>
      <p><strong>Your assistant.</strong> When you connect an assistant, you let it read and save to the teams you grant it, on your behalf. Its answers come from what your team saved, and it can still get things wrong. Check anything that matters, like a deadline or a file version, against the source it links to.</p>
      <p><strong>Texts.</strong> On the cohort trip board, when you enter your mobile number, we text it a sign-in code to confirm it is yours. That is the only text Loop sends. No marketing. Msg &amp; data rates may apply. Carriers are not liable for delayed or undelivered messages. US numbers only for now.</p>
      <p><strong>No guarantees.</strong> Loop is provided as is, and as a pilot it may change or stop. It keeps track of a plan; it does not do the work, book, pay for, or guarantee anything.</p>
      <p><strong>Your information.</strong> See <Link href="/privacy">Privacy</Link>. Questions: <a href="mailto:xwf2@cornell.edu">xwf2@cornell.edu</a>.</p>
    </Legal>
  );
}
