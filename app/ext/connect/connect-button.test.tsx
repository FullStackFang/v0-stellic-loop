import {act,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';

// Spec: openspec/changes/loopd-browser-extension/specs/browser-extension ("Connecting and disconnecting").
const actions=vi.hoisted(()=>({connectExtAction:vi.fn(),disconnectExtAction:vi.fn()}));
vi.mock('./actions',()=>actions);
import {ConnectButton} from './connect-button';

const posted:unknown[]=[];
beforeEach(()=>{
 posted.length=0;actions.connectExtAction.mockReset();actions.disconnectExtAction.mockReset();
 vi.spyOn(window,'postMessage').mockImplementation((message:unknown)=>{posted.push(message);});
});
/** What the extension's script on this page says back. */
const extension=(loopd:string)=>act(()=>{window.dispatchEvent(new MessageEvent('message',{data:{loopd},origin:window.location.origin,source:window}));});

it('waits for the extension, then hands it a token and says it is connected',async()=>{
 actions.connectExtAction.mockResolvedValue({token:'t'.repeat(43)});
 render(<ConnectButton connected={false} />);
 expect(posted).toContainEqual({loopd:'ext-ask'});
 expect(screen.getByRole('button',{name:'Connect'})).toBeDisabled();
 await extension('ext-here');
 fireEvent.click(screen.getByRole('button',{name:'Connect'}));
 await waitFor(()=>expect(posted).toContainEqual({loopd:'ext-token',token:'t'.repeat(43)}));
 await extension('ext-saved');
 expect(screen.getByRole('status').textContent).toMatch(/^Connected/);
 expect(screen.getByRole('button',{name:'Disconnect'})).toBeTruthy();
});
it('takes no word from another origin',async()=>{
 render(<ConnectButton connected={false} />);
 await act(()=>{window.dispatchEvent(new MessageEvent('message',{data:{loopd:'ext-here'},origin:'https://lu.ma',source:window}));});
 expect(screen.getByRole('button',{name:'Connect'})).toBeDisabled();
});
it('disconnects, and tells the extension to forget its token',async()=>{
 actions.disconnectExtAction.mockResolvedValue({ok:true});
 render(<ConnectButton connected />);
 expect(screen.getByRole('status').textContent).toBe('Your extension is connected.');
 fireEvent.click(screen.getByRole('button',{name:'Disconnect'}));
 await waitFor(()=>expect(posted).toContainEqual({loopd:'ext-forget'}));
 expect(screen.getByRole('button',{name:'Connect'})).toBeTruthy();
});
