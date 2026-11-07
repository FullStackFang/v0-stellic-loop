// Loaded only by the explicit browser-rehearsal command, never by Next.js.
import { registerHooks } from 'node:module';
if (process.env.NODE_ENV === 'production') throw new Error('Synthetic browser rehearsal is disabled in production');
process.env.NODE_ENV = 'test';
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only' || specifier === 'next/cache') return {url:new URL('./next-context.cjs',import.meta.url).href,shortCircuit:true};
    return nextResolve(specifier,context);
  },
});
