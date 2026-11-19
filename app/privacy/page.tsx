import type { Metadata } from "next";
import Link from "next/link";
import { Legal, type LegalPart } from "@/components/Legal";

export const metadata: Metadata = { title: "Privacy · Loop" };

const MAIL = <a href="mailto:xwf2@cornell.edu">xwf2@cornell.edu</a>;
const PARTS: LegalPart[] = [
  { id: "keep", name: "What we keep", short: "Your name, your email, and what you save.",
    full: <>Loop keeps a group’s plan in one place: who has what, the decisions, the links and files, when things are due. Each member can ask their own AI assistant about it. This page says what we keep and who sees it. Your name and the email address you sign in with. The teams you belong to. What you or your assistant save to a team: claims, decisions, asks, links, announcements and the files your team uploads. The assistants you connect, the access you grant each one, and a log of what each one did. A cookie keeps you signed in on your device.</> },
  { id: "see", name: "Who sees it", short: "Your group sees it. Nothing is public.",
    full: <>What you save to a team is seen by the people on that team, and by the assistants they have given access to that team. Your email address is seen only by the people who manage the team, since they invite you with it. Nothing you save is public.</> },
  { id: "assistant", name: "Your assistant", short: "It sees only the groups you grant.",
    full: <>Loop does not read your conversations with your assistant. An assistant sees only the teams you grant it, and only what it asks Loop for. A grant lasts 30 days, and you can revoke it at any time under Connections. What an assistant has already read stays with it and with its provider, under that provider’s own privacy terms.</> },
  { id: "files", name: "Files", short: "Read so the right passage is found. Never used to train AI.",
    full: <>When your team uploads a file, we pull out its text so assistants can find the right passage. That text is processed by an AI service run through our hosting provider. It is not used to train AI models.</> },
  { id: "campus", name: "Campus events", short: "Checking in keeps the time, never where you are.",
    full: <>On a campus’s “This week” we keep the school your email belongs to, the events you say you are in for, the plans you post, who you invite, and the rewards you mark as used. When you press “Check in” we record that you were at that event with that group and the time you pressed it; we do not record your location. People who share a group with you, or who have checked in on an outing with you, see your first name and your sign-in photo on events you are going to, and so do the people in the same outing. Everyone else sees only how many are going. If you post a plan, signed-in people at your school see your first name on it. “Register me” on an event from a school calendar is kept in Loop only: the organizer and the calendar it came from are not told. The map in an event’s details is loaded from OpenStreetMap when you open it.</> },
  { id: "trip", name: "The trip board", short: "Your number gets a sign‑in code. Nothing else.",
    full: <>If you use the cohort trip board, we also keep your mobile number and your answers on it. We text your number only a sign-in code, when you ask for one. Msg &amp; data rates may apply. Nobody else on the board sees your number.</> },
  { id: "sell", name: "No selling, no marketing", short: "No selling. No marketing.",
    full: <>We do not sell your information or share it with anyone for marketing. Mobile numbers and text opt-in consent are never shared with third parties or affiliates for marketing or promotional purposes. We use a few service providers only to run Loop: Clerk (sign-in), Supabase (database), Vercel (hosting and AI processing) and Twilio (trip board sign-in codes).</> },
  { id: "leave", name: "Leaving and deleting", short: "Leave any time. Email us to delete.",
    full: <>If you leave a team, what you saved stays in that team’s record, shown as from a former teammate, and your claims are released. To get a copy of your data or have it deleted, email {MAIL}. Deleting it removes your membership and revokes every assistant’s access. It cannot recall what was already exported or delivered to an assistant, and removal from backups may take longer.</> },
  { id: "ask", name: "Questions", short: "Ask a person. A person answers.",
    full: <>Email {MAIL}. See also the <Link href="/terms">Terms</Link>.</> },
];

export default function Privacy() {
  return <Legal title="Privacy" updated="November 17, 2026" gist="What we keep, and who sees it." parts={PARTS} />;
}
