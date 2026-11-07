import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryForm, ConnectionForm } from '../portal-forms';
import type { PortalAction } from '../portal-types';
import { AssistantReview } from '../assistant-review';
import { MemoryProposalReview } from '../memory-proposal-review';

describe('member forms', () => {
  it('submits explicit private memory and exposes stale correction recovery', async () => {
    const action = vi.fn<PortalAction>().mockResolvedValue({ status: 'error', message: 'This item changed. Reload before correcting it.' });
    render(<MemoryForm action={action} operationId="fixture-operation" />);
    fireEvent.change(screen.getByLabelText('Preference'), { target: { value: 'Quiet walks' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save private preference' }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0][1].get('text')).toBe('Quiet walks');
    expect(await screen.findByRole('alert')).toHaveTextContent('Reload');
    expect(screen.getByText(/does not publish/)).toBeInTheDocument();
  });
  it('requires deliberate action selection instead of granting defaults', () => {
    render(<ConnectionForm action={vi.fn()} />);
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).not.toBeChecked();
    expect(screen.getByLabelText('Expires at (UTC)')).toBeRequired();
  });
  it('submits explicit UTC bounds and preserves the selected private context', async () => {
    const action = vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Saved.'});
    const scope = {orgId:'00000000-0000-4000-8000-000000000001',loopId:'00000000-0000-4000-8000-000000000002'};
    render(<MemoryForm action={action} operationId="fixture-operation" kind="intent" scope={scope}/>);
    expect(screen.getByLabelText('Starts at (UTC)')).toBeRequired();
    expect(screen.getByLabelText('Ends at (UTC)')).toBeRequired();
    fireEvent.change(screen.getByLabelText('Preference'),{target:{value:'Visit the gallery'}});
    fireEvent.change(screen.getByLabelText('Starts at (UTC)'),{target:{value:'2099-03-01T10:00:00'}});
    fireEvent.change(screen.getByLabelText('Ends at (UTC)'),{target:{value:'2099-03-01T11:00:00'}});
    fireEvent.click(screen.getByRole('button',{name:'Save time-boxed intent'}));
    await waitFor(()=>expect(action).toHaveBeenCalled());
    const submitted=action.mock.calls[0][1];
    expect(submitted.get('kind')).toBe('intent');
    expect(submitted.get('orgId')).toBe(scope.orgId);
    expect(submitted.get('loopId')).toBe(scope.loopId);
  });
  it('offers named authorized assistant contexts without raw identifier fields', () => {
    const loop={orgId:'00000000-0000-4000-8000-000000000001',loopId:'00000000-0000-4000-8000-000000000002',orgName:'EMBA',path:'trip/vietnam'};
    render(<ConnectionForm action={vi.fn()} loops={[loop]}/>);
    expect(screen.getByLabelText('Access context')).toHaveTextContent('EMBA / trip/vietnam');
    expect(screen.queryByLabelText('Organization ID (optional)')).not.toBeInTheDocument();
  });
  it('reviews exact conditions before exposing a separate approval', async () => {
    const approve=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Approved',confirmationId:'confirmation-id'});
    const review=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Nothing approved.',review:{binding:'{"revision":2}',clientId:'assistant',action:'commitment',revision:2,title:'Hanoi walk',place:'Hanoi',startsAt:'2027-03-12T09:00:00Z',endsAt:'2027-03-12T10:00:00Z',timezone:'Asia/Ho_Chi_Minh',conditions:'At least 3 other people; required member IDs: none.',disclosure:'This action does not grant name disclosure.'}});
    render(<AssistantReview reviewAction={review} approveAction={approve}/>);
    expect(screen.queryByRole('button',{name:'Approve this exact assistant action'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Structured action from your assistant'),{target:{value:'proposal'}});
    fireEvent.click(screen.getByRole('button',{name:'Review action'}));
    expect(await screen.findByText('At least 3 other people; required member IDs: none.')).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Approve this exact assistant action'}));
    await waitFor(()=>expect(approve).toHaveBeenCalled());
    expect(approve.mock.calls[0][1].get('binding')).toBe('{"revision":2}');
    expect(await screen.findByLabelText('Confirmation ID')).toHaveValue('confirmation-id');
  });
  it('shows a transient want conflict before offering explicit acceptance', async () => {
    const candidate={kind:'want' as const,text:'Try a museum',category:'culture' as const,place:null,strength:0.6,confidence:0.8,orgId:null,loopId:null};
    const review=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'This proposal differs from your current want.',memoryReview:{outcome:'conflict',candidate,current:{version:2,text:'Prefer a gallery',category:'culture',place:null,strength:0.8,confidence:1,status:'active'},binding:JSON.stringify(candidate),operationId:'00000000-0000-4000-8000-000000000001'}});
    const accept=vi.fn<PortalAction>().mockResolvedValue({status:'success',message:'Accepted and saved as your active want.'});
    render(<MemoryProposalReview reviewAction={review} acceptAction={accept}/>);
    expect(screen.queryByRole('button',{name:'Accept this want'})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Structured want proposal (JSON)'),{target:{value:JSON.stringify(candidate)}});
    fireEvent.click(screen.getByRole('button',{name:'Review proposed want'}));
    expect(await screen.findByText('Prefer a gallery')).toBeInTheDocument();
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button',{name:'Accept this want'}));
    await waitFor(()=>expect(accept).toHaveBeenCalled());
    expect(accept.mock.calls[0][1].get('binding')).toBe(JSON.stringify(candidate));
  });
});
