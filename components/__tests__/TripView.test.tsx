import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TripView } from '../TripView';
import { changeTrip } from '@/actions/trip';
vi.mock('next/navigation', () => ({useRouter: () => ({refresh:vi.fn()})}));
vi.mock('@/actions/trip', () => ({changeTrip:vi.fn().mockResolvedValue({ok:true}),joinTrip:vi.fn()}));
vi.mock('@/actions/verifyCode', () => ({verifyCode:vi.fn()}));
const board = {id:'b',slug:'cohort',name:'Cohort global trip',tz:'UTC',window_kind:'rolling' as const,window_start:null,window_end:null};
const trip = {board_id:'b',owner_id:'me',destination:'',start_day:null,end_day:null};
it('opens an arrival form, keeps sharing off by default, and saves the entered details', async () => {
  render(<TripView board={board} trip={trip} items={[]} me={{id:'me',name:'You'}} />);
  fireEvent.click(screen.getByRole('button',{name:/Add your arrival/}));
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.change(screen.getByLabelText('Title'),{target:{value:'My flight'}});
  fireEvent.change(screen.getByLabelText('Arrival date'),{target:{value:'2027-06-12'}});
  fireEvent.click(screen.getByRole('button',{name:'Save'}));
  await waitFor(() => expect(changeTrip).toHaveBeenCalled());
  const data = vi.mocked(changeTrip).mock.calls.at(-1)![2];
  expect(data.get('title')).toBe('My flight'); expect(data.get('day')).toBe('2027-06-12'); expect(data.get('shared')).toBeNull();
});
it('asks a signed-out visitor to verify before adding a plan', () => {
  render(<TripView board={board} trip={trip} items={[]} me={null} />);
  fireEvent.click(screen.getByRole('button',{name:'+ Add activity'}));
  expect(screen.getByLabelText('Your number')).toBeVisible();
  expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
});
