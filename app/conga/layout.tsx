import { CampusShell } from '@/components/campus/shell';

/** Conga's page sits in the campus shell like every page with the bar: its colours, and the sign-in its "Sign in" opens. */
export default function CongaLayout({ children }: { children: React.ReactNode }) {
  return <CampusShell>{children}</CampusShell>;
}
