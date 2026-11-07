export function ActivityTimes({timezone,startsAt,endsAt,deadline}:{timezone:string;startsAt:string;endsAt:string;deadline:string}) {
  const format=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const local=(instant:string)=><time dateTime={instant}>{format.format(new Date(instant))}</time>;
  return <>
    <p>Trip timezone: {timezone}</p>
    <p>Starts {local(startsAt)} · Ends {local(endsAt)}</p>
    <p>Commitment deadline {local(deadline)}</p>
    <details className="emba-meta"><summary>UTC reference</summary><p>{new Date(startsAt).toISOString()} to {new Date(endsAt).toISOString()} (UTC)</p><p>Deadline {new Date(deadline).toISOString()} (UTC)</p></details>
  </>;
}
