import { escapeHtml } from "@/lib/email";
import { getMembershipLoopSlug, setRsvp } from "@/lib/rsvp";
import { verifyRsvpLink, type RsvpLinkPayload, type RsvpStatus } from "@/lib/signedLink";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * One-tap In/Out link from the reminder email (meeting-reminder "One-tap
 * links are signed, single-purpose, and expire"; design.md "Signed one-tap
 * links in reminders").
 *
 * GET never writes, because email link scanners fetch every link: a valid
 * token gets a tiny page whose form POSTs back to this URL (auto-submitted
 * by an inline script, with a visible button as the fallback). POST
 * re-verifies the token from the path, records exactly that RSVP, and
 * redirects to the member page with `?marked=<status>&occ=<id>`, where the
 * page (behind sign-in) shows "Marked you as In for Thursday" with an undo.
 * A bad or old token gets the same small "expired" page on both methods.
 * This handler never creates a session, sets no cookie, and puts no member
 * data in any response.
 */

// Dynamic by construction: it awaits its [token] params and has no generateStaticParams.

const EXPIRED_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Link expired</title>
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:0;padding:48px 16px;color:#222;background:#fff}
main{max-width:420px;margin:0 auto}
a{color:#1a56db}
</style>
</head>
<body>
<main>
<h1 style="font-size:20px">This link has expired.</h1>
<p><a href="/signin">Sign in</a> to answer from your member page.</p>
</main>
</body>
</html>
`;

function expiredPage(): Response {
  return new Response(EXPIRED_PAGE, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

/** The scanner-safe GET response: a form that POSTs the same token back. */
function confirmPage(token: string, status: RsvpStatus): Response {
  const action = escapeHtml(`/r/${encodeURIComponent(token)}`);
  const label = status === "in" ? "Mark me In" : "Mark me Out";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label}</title>
<style>
body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;margin:0;padding:48px 16px;color:#222;background:#fff}
main{max-width:420px;margin:0 auto}
button{font:inherit;padding:10px 18px;border:1px solid #999;border-radius:6px;background:#fff;color:#222;cursor:pointer}
</style>
</head>
<body>
<main>
<form method="post" action="${action}"><button type="submit">${label}</button></form>
</main>
<script>document.forms[0].submit()</script>
</body>
</html>
`;
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function redirectTo(request: Request, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { location: new URL(path, request.url).toString(), "cache-control": "no-store" },
  });
}

type Context = { params: Promise<{ token: string }> };

function verify(token: string): RsvpLinkPayload | null {
  return verifyRsvpLink(token, process.env.REMINDER_LINK_SECRET ?? "");
}

/** Verifies the token and nothing else; a link scanner's fetch writes nothing. */
export async function GET(_request: Request, context: Context) {
  const { token } = await context.params;
  const payload = verify(token);
  if (!payload) return expiredPage();
  return confirmPage(token, payload.status);
}

export async function POST(request: Request, context: Context) {
  const { token } = await context.params;
  const payload = verify(token);
  if (!payload) return expiredPage();

  try {
    const db = createAdminClient();
    const slug = await getMembershipLoopSlug(db, payload.membershipId);
    if (!slug) return expiredPage();

    const result = await setRsvp(db, {
      membershipId: payload.membershipId,
      occurrenceId: payload.occurrenceId,
      status: payload.status,
      now: new Date(),
    });

    const memberPage = `/l/${slug}/me`;
    if (!result.ok) return redirectTo(request, memberPage);
    const query = new URLSearchParams({ marked: payload.status, occ: payload.occurrenceId });
    return redirectTo(request, `${memberPage}?${query}`);
  } catch (err) {
    console.error("one-tap RSVP failed", err);
    return expiredPage();
  }
}
