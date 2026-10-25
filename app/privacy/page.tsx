import type { Metadata } from "next";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy · Quorum" };

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="October 25, 2026">
      <p>Quorum is a private board for a group: people post plans, say whether they are in, and the plan is on when enough of them are.</p>
      <p><strong>What we keep.</strong> Your name and mobile number, the boards you join, what you say on them (in, maybe, out, the days that work), and a record of the texts we send you. A cookie keeps you signed in on your device.</p>
      <p><strong>Who sees it.</strong> People on the same board see your name next to your answers unless you turn your name off. Nobody sees your number.</p>
      <p><strong>Texts.</strong> We use your number to text you sign-in codes and updates about plans you are in. Message frequency varies. Msg &amp; data rates may apply. Reply STOP to any text to stop them, START to resume, HELP for help.</p>
      <p><strong>No sharing.</strong> We do not sell your information or share it with anyone for marketing. Mobile numbers and text opt-in consent are never shared with third parties or affiliates for marketing or promotional purposes. We use a few service providers only to run Quorum: Supabase (database), Vercel (hosting) and Twilio (texts).</p>
      <p><strong>Deleting it.</strong> Reply HELP to any text to ask us to delete your number and answers, and we will.</p>
    </Legal>
  );
}
