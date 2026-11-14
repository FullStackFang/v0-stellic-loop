import { expect, it } from 'vitest';
import { emailOf, linkTitle, slugOf, sortInput } from '@/lib/emba/start-sort';

const folder = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
it('sorts links (a Drive folder is one of them), emails and a note out of one paste', () => {
  expect(sortInput(`https://example.edu/syllabus priya@Example.edu, <marcus@example.edu>\n${folder}?usp=sharing\nKickoff is Thursday at 6.`)).toEqual({
    links: ['https://example.edu/syllabus', `${folder}?usp=sharing`], emails: ['priya@example.edu', 'marcus@example.edu'], note: 'Kickoff is Thursday at 6.',
  });
});
it('adds nothing for an address that is not a usable link, and no note for leftovers that say nothing', () => {
  for (const junk of ['http://', 'https://', 'http://example.edu/plain', 'https://10.0.0.1/x', 'https://user:pw@example.edu/', 'not@an@email', '@nobody']) expect(sortInput(junk), junk).toMatchObject({ links: [], emails: [] });
  expect(sortInput('https://example.edu/a and priya@example.edu')).toEqual({ links: ['https://example.edu/a'], emails: ['priya@example.edu'], note: '' });
  expect(sortInput('https://example.edu/a https://example.edu/a PRIYA@example.edu priya@example.edu')).toMatchObject({ links: ['https://example.edu/a'], emails: ['priya@example.edu'] });
});
it('keeps a note with its line breaks and a sentence that ends in a link', () => {
  expect(sortInput('Welcome.\nRead this first: https://example.edu/start.')).toEqual({ links: ['https://example.edu/start'], emails: [], note: 'Welcome.\nRead this first:' });
});
it('makes a handle from a name and a title from a link', () => {
  expect(slugOf('NBAE 6830: Venture Creation!')).toBe('nbae-6830-venture-creation');
  expect(slugOf('  Équipe №1  ')).toBe('equipe-no1');
  expect(emailOf(' Priya@Example.EDU ')).toBe('priya@example.edu');
  expect(linkTitle('https://www.example.edu/courses/nbae%206830')).toBe('example.edu/courses/nbae 6830');
  expect(linkTitle('https://example.edu/')).toBe('example.edu');
  expect(linkTitle('https://example.edu/a%zz')).toBe('example.edu/a%zz');
});
