// Where an error page says which error it showed (components/errors/spill.tsx). One line goes to the server's log:
// the code on the person's screen, the page they were on, and the message. Searching the log for a code finds it.
// Nothing is stored anywhere else, and nothing about the person is written.

const cut = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : null;

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (typeof body !== 'object' || body === null) return new Response(null, { status: 400 });
  const { code, path, message, server } = body as Record<string, unknown>;
  if (typeof code !== 'string' || !/^[\w-]{1,40}$/.test(code)) return new Response(null, { status: 400 });
  console.error('page error', JSON.stringify({ code, path: cut(path, 300), message: cut(message, 300), server: server === true }));
  return new Response(null, { status: 204 });
}
