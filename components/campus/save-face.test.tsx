import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SaveFace } from './save-face';

// Spec: openspec/changes/loop-save-picture/specs/save-picture. The server (app/c/save/route.test.ts) is what makes the
// picture and decides about the mark; here it is stood in for, and the pane's own steps are what is checked.
/** Each sign-up the one Get button sent (app/c/ink/join): what it asked for. */
const joins: unknown[] = [];

const SWATCHES = [{ key: 'school', name: 'Your school', colour: 'red' }, { key: 'ink', name: 'Ink', colour: 'black' }, { key: 'cream', name: 'Cream', colour: 'beige' }];
/** The server: whether this person has Ink+, and whether they wear an animal. Every address asked for is kept. */
const server = { plus: false, animal: true, asked: [] as string[] };
const saved: { name: string; href: string }[] = [];
/** The pictures the pane asked for ahead of a press. */
const ahead: string[] = [];
beforeEach(() => {
  Object.assign(server, { plus: false, animal: true, asked: [] }); saved.length = 0; joins.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (href: string, init?: RequestInit) => {
    server.asked.push(href);
    // As much of an answer as the pane reads. (A real Response cannot carry the test browser's Blob.)
    const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => String(body), blob: async () => new Blob(['png'], { type: 'image/png' }) });
    if (href === '/c/ink/join') { joins.push(JSON.parse(String(init?.body))); server.plus = true; return answer(200, { ok: true, said: 'Thanks for your interest. This isn’t ready yet, so we’ve upgraded you to Ink+ for now.' }); }
    if (href.includes('grounds=1')) return answer(200, SWATCHES);
    if (!server.animal) return answer(409, 'Pick an animal as your picture to save it.');
    if (href.includes('mark=0') && !server.plus) return answer(403, 'Saving without the Loopd mark comes with Loopd Ink+.');
    return answer(200, '');
  }));
  ahead.length = 0; vi.spyOn(HTMLImageElement.prototype, 'src', 'set').mockImplementation(href => { ahead.push(href); });
  URL.createObjectURL = vi.fn(() => 'blob:picture'); URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push({ name: this.download, href: this.href }); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// PREVIEW_DIR=… writes a state as a static page to look at, with the app's own style sheets. Its picture is PREVIEW_DIR/<shape>.png (lib/__tests__/campus-save-picture.test.ts writes those).
const sheet = (file: string) => `<link rel="stylesheet" href="${pathToFileURL(path.resolve(file)).href}">`;
const preview = (name: string, shape: string) => process.env.PREVIEW_DIR && writeFileSync(`${process.env.PREVIEW_DIR}/${name}.html`, `<!doctype html><html data-kit="cornell"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">${sheet('app/c/campus.css')}${sheet('app/c/save-face.css')}</head><body style="margin:0"><div class="cs" style="min-height:0;padding:24px 24px 40px"><div class="cs-lvl" style="position:relative;top:0;animation:none">${document.body.innerHTML.replace(/src="[^"]*"/, `src="${pathToFileURL(path.resolve(process.env.PREVIEW_DIR, `${shape}.png`)).href}"`)}</div></div></body></html>`);
const view = () => screen.getByRole('img') as HTMLImageElement;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

it('shows the picture as it will be saved, in the shape and on the ground picked, and saves it free with the mark', async () => {
  const back = vi.fn();
  render(<SaveFace onBack={back} />);
  expect(view().getAttribute('src')).toBe('/c/save?shape=profile&ground=school&small=1');
  expect(screen.getByRole('button', { name: 'Profile' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'With the mark' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/1080 × 1080/)).toBeInTheDocument();
  // The grounds are the server's: this person's school first.
  press(await screen.findByRole('button', { name: 'Cream' }).then(() => 'Cream'));
  // Every shape was asked for ahead, and each ground of the shape in view.
  expect(ahead).toEqual(expect.arrayContaining(['/c/save?shape=tall&ground=cream&small=1', '/c/save?shape=sticker&ground=cream&small=1', '/c/save?shape=profile&ground=ink&small=1']));
  // A picture that has not arrived is not shown; its frame already has the picked shape's size, so nothing jumps.
  fireEvent.load(view());
  expect(view()).not.toHaveClass('wait');
  press('Lock screen');
  expect(view().parentElement).toHaveClass('cs-save-frame', 'tall');
  expect(view()).toHaveClass('wait');
  // Its frame holds the small loader until it has, once it has been 300 ms.
  expect(await screen.findByRole('status')).toHaveTextContent('Looping you in…');
  expect(view().getAttribute('src')).toBe('/c/save?shape=tall&ground=cream&small=1');
  fireEvent.load(view());
  expect(view()).not.toHaveClass('wait');
  // Going back shows the picture it already has, at once.
  press('Profile');
  expect(view()).not.toHaveClass('wait');
  press('Lock screen');
  expect(screen.getByText(/1080 × 1920/)).toBeInTheDocument();
  preview('pane-tall', 'tall');
  press('Save');
  await waitFor(() => expect(saved).toEqual([{ name: 'loop-lock-screen.png', href: 'blob:picture' }]));
  expect(server.asked).toContain('/c/save?shape=tall&ground=cream');
  // A sticker has no ground: the colours step aside, and keep their place.
  press('Sticker');
  expect(screen.queryByRole('button', { name: 'Cream' })).toBeNull();
  expect(screen.getByLabelText('Cream')).not.toBeVisible();
  expect(screen.getByText(/512 × 512, no ground/)).toBeInTheDocument();
  press('Done');
  expect(back).toHaveBeenCalled();
});

it('shows the Ink+ plan for "No mark", signs up in one press, charges nothing and then saves without the mark', async () => {
  render(<SaveFace onBack={() => {}} />);
  press(/No mark/);
  expect(await screen.findByText('$9.99')).toBeInTheDocument();
  expect(screen.getByText('Your picture, no mark')).toBeInTheDocument();
  preview('pane-plan', 'profile');
  expect(saved).toEqual([]);
  // The one Get button: one press, the account's email, no box to type it in.
  expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
  press('Get Ink+ · $9.99');
  expect(await screen.findByText('You’re in. The mark is off.')).toBeInTheDocument();
  expect(joins).toEqual([{ plan: 'plus', place: 'save picture: Get Ink+', back: '/' }]);
  expect(screen.getByText(/This isn’t ready yet, so we’ve upgraded you to Ink\+ for now/)).toBeInTheDocument();
  preview('pane-joined', 'profile');
  press('Save without the mark');
  await waitFor(() => expect(saved).toEqual([{ name: 'profile.png', href: 'blob:picture' }]));
  expect(server.asked).toContain('/c/save?shape=profile&ground=school&mark=0');
  // Back in the pane the mark stays off, and the picture shown is the one without it.
  press('Back');
  expect(screen.getByRole('button', { name: /No mark/ })).toHaveAttribute('aria-pressed', 'true');
  expect(view().getAttribute('src')).toBe('/c/save?shape=profile&ground=school&mark=0&small=1');
});

it('takes the mark off at once for someone the server lets, and puts it back', async () => {
  server.plus = true;
  render(<SaveFace onBack={() => {}} />);
  press(/No mark/);
  await waitFor(() => expect(screen.getByRole('button', { name: /No mark/ })).toHaveAttribute('aria-pressed', 'true'));
  expect(screen.queryByText('$9.99')).toBeNull();
  preview('pane-profile', 'profile-no-mark');
  press('With the mark');
  expect(view().getAttribute('src')).toBe('/c/save?shape=profile&ground=school&small=1');
});

it("saves a group's picture, and says so when there is nothing to save", async () => {
  const of = { orgId: 'o1', loopId: 'g1' };
  const { unmount } = render(<SaveFace of={of} onBack={() => {}} />);
  expect(screen.getByText('The group’s picture')).toBeInTheDocument();
  expect(view().getAttribute('src')).toBe('/c/save?shape=profile&ground=school&org=o1&group=g1&small=1');
  unmount();
  server.animal = false;
  render(<SaveFace onBack={() => {}} />);
  fireEvent.error(view());
  expect(await screen.findByText('Pick an animal as your picture to save it.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
});
