import type { Metadata } from "next";
import Link from "next/link";
import { Legal } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy · Loop" };

export default function Privacy() {
  return (
    <Legal title="Privacy" updated="November 12, 2026">
      <p>Loop keeps a group’s plan in one place: who has what, the decisions, the links and files, when things are due. Each member can ask their own AI assistant about it. This page says what we keep and who sees it.</p>
      <p><strong>What we keep.</strong> Your name and the email address you sign in with. The teams you belong to. What you or your assistant save to a team: claims, decisions, asks, links, announcements and the files your team uploads. The assistants you connect, the access you grant each one, and a log of what each one did. A cookie keeps you signed in on your device.</p>
      <p><strong>Who sees it.</strong> What you save to a team is seen by the people on that team, and by the assistants they have given access to that team. Your email address is seen only by the people who manage the team, since they invite you with it. Nothing you save is public.</p>
      <p><strong>Your assistant.</strong> Loop does not read your conversations with your assistant. An assistant sees only the teams you grant it, and only what it asks Loop for. A grant lasts 30 days, and you can revoke it at any time under Connections. What an assistant has already read stays with it and with its provider, under that provider’s own privacy terms.</p>
      <p><strong>Files.</strong> When your team uploads a file, we pull out its text so assistants can find the right passage. That text is processed by an AI service run through our hosting provider. It is not used to train AI models.</p>
      <p><strong>The trip board.</strong> If you use the cohort trip board, we also keep your mobile number and your answers on it. We text your number only a sign-in code, when you ask for one. Msg &amp; data rates may apply. Nobody else on the board sees your number.</p>
      <p><strong>No selling, no marketing.</strong> We do not sell your information or share it with anyone for marketing. Mobile numbers and text opt-in consent are never shared with third parties or affiliates for marketing or promotional purposes. We use a few service providers only to run Loop: Clerk (sign-in), Supabase (database), Vercel (hosting and AI processing) and Twilio (trip board sign-in codes).</p>
      <p><strong>Leaving and deleting.</strong> If you leave a team, what you saved stays in that team’s record, shown as from a former teammate, and your claims are released. To get a copy of your data or have it deleted, email <a href="mailto:xwf2@cornell.edu">xwf2@cornell.edu</a>. Deleting it removes your membership and revokes every assistant’s access. It cannot recall what was already exported or delivered to an assistant, and removal from backups may take longer.</p>
      <p><strong>Questions.</strong> Email <a href="mailto:xwf2@cornell.edu">xwf2@cornell.edu</a>. See also the <Link href="/terms">Terms</Link>.</p>
    </Legal>
  );
}
