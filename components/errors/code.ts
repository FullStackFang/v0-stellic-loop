/**
 * The code an error page shows, and the one its report carries. An error thrown on the server arrives with a digest,
 * which is what the server wrote beside it in its log, so that is the code. An error thrown in the browser has none:
 * its code is worked out from what was thrown, the same every time for the same error.
 */
export function errorCode(error: unknown): string {
  const digest = error instanceof Error ? (error as Error & { digest?: unknown }).digest : null;
  if (typeof digest === 'string' && /^[\w-]{1,40}$/.test(digest)) return digest;
  const said = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const hash = [...said].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return String(hash).padStart(10, '0');
}
/** Whether the code is the server's own, and so can be looked up in its log as it is. */
export const fromServer = (error: unknown) => error instanceof Error && typeof (error as Error & { digest?: unknown }).digest === 'string';
