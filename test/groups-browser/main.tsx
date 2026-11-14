// The browser half of scripts/groups-browser.ts: the page's own markup, with the real client components mounted in it.
// ?actor=owner|organizer|outer|inner|stranger|none  &page=members|team|event|ask  &slug=team-1  &tab=…  &ask=1|2|3
import { createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Invite, JoinLink, Roster, WaitingList } from '../../app/groups/[namespace]/members-panel';
import { ActionForm } from '../../components/emba/portal-forms';
import type { PortalAction, PortalResult } from '../../components/emba/portal-types';
import '../../app/globals.css';
import '../../app/loop.css';
import '../emba-browser/font.css';

const PANELS: Record<string, ComponentType<never>> = { roster: Roster, joinLink: JoinLink, invite: Invite, waiting: WaitingList };
type Page = { html?: string; error?: string; shell: boolean; props: Record<string, { actionNames: string[] } & Record<string, unknown>>; forms: { label: string; html: string }[]; capability: string };
const query = new URLSearchParams(location.search), panels = new Map<string, Root>();
let roots: Root[] = [];
const read = async (): Promise<Page> => (await fetch(`/__fixture/page?${query}`)).json();
const send = async (page: Page, body: object, data: FormData): Promise<PortalResult> => {
  const answer = await (await fetch(`/__fixture/action?${query}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-rehearsal-capability': page.capability }, body: JSON.stringify({ ...body, entries: [...data.entries()].filter(([, value]) => typeof value === 'string') }) })).json();
  return answer.status ? answer : { status: 'error', message: answer.error ?? 'Denied' };
};

/** Puts the page on screen. A page of forms is drawn afresh after each action, as a server action redraws its page. */
function draw(page: Page, said?: PortalResult) {
  for (const root of roots) root.unmount();
  roots = []; panels.clear();
  const body = page.html ?? `<p role="alert">${page.error}</p>`;
  document.getElementById('root')!.innerHTML = (page.shell ? `<div class="lp"><aside class="lp-rail"></aside><main class="lp-main"><div class="lp-wrap">${body}</div></main></div>` : body)
    + (said?.message ? `<p data-said role="status" style="position:fixed;left:12px;bottom:12px;margin:0;padding:8px 12px;border-radius:10px;background:#123;color:#fff;font:13px system-ui">${said.status}: ${said.message}</p>` : '');
  for (const slot of Object.keys(page.props ?? {})) { const root = createRoot(document.querySelector(`[data-slot=${slot}]`)!); panels.set(slot, root); roots.push(root); }
  for (const [index, form] of (page.forms ?? []).entries()) {
    const root = createRoot(document.querySelector(`[data-form="${index}"]`)!); roots.push(root);
    const action: PortalAction = async (_previous, data) => { const answer = await send(page, { form: index }, data); draw(await read(), answer); return answer; };
    root.render(createElement(ActionForm, { action, label: form.label } as never, createElement('div', { style: { display: 'contents' }, dangerouslySetInnerHTML: { __html: form.html } })));
  }
  fill(page);
}
/** The Members panels keep their own state (the search, the armed button), so an action only hands them new props. */
function fill(page: Page) {
  const act = (name: string): PortalAction => async (_previous, data) => { const answer = await send(page, { action: name }, data); fill(await read()); return answer; };
  for (const [slot, { actionNames, ...props }] of Object.entries(page.props ?? {})) panels.get(slot)?.render(createElement(PANELS[slot], { ...props, actions: Object.fromEntries(actionNames.map(name => [name, act(name)])) } as never));
}

draw(await read());
