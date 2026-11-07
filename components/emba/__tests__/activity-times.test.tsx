import {expect,it} from 'vitest';
import {render,screen} from '@testing-library/react';
import {ActivityTimes} from '../activity-times';

it('shows Hanoi local dates across midnight and retains exact UTC references',()=>{
 render(<ActivityTimes timezone="Asia/Ho_Chi_Minh" startsAt="2027-03-12T16:30:00Z" endsAt="2027-03-12T18:00:00Z" deadline="2027-03-11T16:00:00Z"/>);
 expect(screen.getByText('12 Mar 2027, 23:30')).toHaveAttribute('dateTime','2027-03-12T16:30:00Z');
 expect(screen.getByText('13 Mar 2027, 01:00')).toBeInTheDocument();
 expect(screen.getByText(/2027-03-12T16:30:00.000Z/)).toBeInTheDocument();
});
it.each([['2027-01-02','14:00'],['2027-07-02','15:00']])('uses Tallinn seasonal offsets for %s',(date,local)=>{
 render(<ActivityTimes timezone="Europe/Tallinn" startsAt={`${date}T12:00:00Z`} endsAt={`${date}T13:00:00Z`} deadline={`${date}T10:00:00Z`}/>);
 expect(screen.getByText(new RegExp(`, ${local}$`))).toHaveAttribute('dateTime',`${date}T12:00:00Z`);
 expect(screen.getByText('Trip timezone: Europe/Tallinn')).toBeInTheDocument();
});
