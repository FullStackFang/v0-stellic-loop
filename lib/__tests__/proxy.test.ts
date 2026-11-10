// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server.js';
import { config } from '@/proxy';

describe('root proxy matcher', () => {
  it.each(['/groups', '/groups/connections', '/groups/sample/resources'])(
    'runs Clerk proxy setup for %s',
    (url) => {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    },
  );
});
