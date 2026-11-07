import {expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {GroupNoteReview} from './group-note-review';
import type {PortalAction} from './portal-types';

it('shows authoritative destination, client, audience and exact changes before a separate checked approval',async()=>{
 const binding='{"payload":"exact reviewed change"}';
 const approve=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Approved',confirmationId:'confirmation'});
 const review=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Review only',groupReview:{binding,clientId:'claude-test',group:'EMBA cohort / vietnam',mutation:'correct',currentText:'Meet at nine',text:'<script>Meet at ten</script>',expectedVersion:2}});
 const {container}=render(<GroupNoteReview reviewAction={review} approveAction={approve}/>);
 expect(screen.queryByRole('button',{name:'Approve this shared note change'})).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('Shared note review from your assistant'),{target:{value:'candidate'}});
 fireEvent.click(screen.getByRole('button',{name:'Review shared note'}));
 expect(await screen.findByRole('heading',{name:'EMBA cohort / vietnam'})).toBeInTheDocument();
 expect(screen.getByText('Assistant client: claude-test')).toBeInTheDocument();
 expect(screen.getByText(/Visible to authorized group members and their consented assistants/)).toBeInTheDocument();
 expect(screen.getByText('Meet at nine')).toBeInTheDocument();expect(screen.getByText('<script>Meet at ten</script>')).toBeInTheDocument();expect(container.querySelector('script')).toBeNull();
 const checkbox=screen.getByRole('checkbox');expect(checkbox).toBeRequired();expect(checkbox).not.toBeChecked();expect(approve).not.toHaveBeenCalled();
 fireEvent.click(checkbox);fireEvent.click(screen.getByRole('button',{name:'Approve this shared note change'}));
 await waitFor(()=>expect(approve).toHaveBeenCalledTimes(1));
 expect(approve.mock.calls[0][1].get('binding')).toBe(binding);expect(approve.mock.calls[0][1].get('reviewed')).toBe('yes');
});
