import { expect, it } from 'vitest';
import { redact } from './analytics';

it('cuts the share token from an address before it is sent, and leaves other addresses alone', () => {
  const sent = (url: string) => redact({ type: 'pageview', url }).url;
  expect(sent('https://loopd.test/o/secret-token-1234567?from=text')).toBe('https://loopd.test/o/shared?from=text');
  expect(sent('https://loopd.test/when/abc123/result')).toBe('https://loopd.test/when/shared/result');
  expect(sent('https://loopd.test/conga?map=cornell')).toBe('https://loopd.test/conga?map=cornell');
  expect(sent('https://loopd.test/organizers')).toBe('https://loopd.test/organizers');
});
