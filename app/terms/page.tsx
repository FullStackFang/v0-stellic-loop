import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Terms · Quorum" };

export default function Terms() {
  return (
    <Legal title="Terms" updated="October 25, 2026">
      <p>Quorum is a free board for a private group to post plans and see who is in. Use it for your group, with people who gave you the link.</p>
      <p><strong>Texts.</strong> When you enter your mobile number, you agree to get texts from Quorum: sign-in codes, and updates about plans you are in (a plan is on, someone dropped out, one more is needed). No marketing. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to stop, START to resume, HELP for help. Carriers are not liable for delayed or undelivered messages. US numbers only for now.</p>
      <p><strong>What you post.</strong> You are responsible for what you post. Do not post anything unlawful or anything about someone that they would not want shared with the group. We may remove posts or boards that break this.</p>
      <p><strong>No guarantees.</strong> Quorum is provided as is. It helps a group decide; it does not book, pay for, or guarantee anything.</p>
      <p><strong>Your information.</strong> See <Link href="/privacy" style={{ textDecoration: "underline" }}>Privacy</Link>.</p>
    </Legal>
  );
}
