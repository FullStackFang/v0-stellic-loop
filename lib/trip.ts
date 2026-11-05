export type TripItem = {
  id: string; owner_id: string; kind: 'activity' | 'arrival' | 'stay' | 'document';
  title: string; day: string | null; time: string; location: string; notes: string;
  shared: boolean; filename: string | null; owner: string; count: number; joined: boolean;
};
export type Trip = { board_id: string; owner_id: string | null; destination: string; start_day: string | null; end_day: string | null };
export function parseTripItem(form: FormData) {
  const str = (key: string, max: number) => String(form.get(key) ?? '').trim().slice(0, max);
  const title = str('title', 121), kind = str('kind', 20), day = str('day', 20), time = str('time', 10);
  if (!title || title.length > 120) throw new Error('Add a title of up to 120 characters.');
  if (!['activity', 'arrival', 'stay', 'document'].includes(kind)) throw new Error('Choose a type of plan.');
  if (day && !validTripDay(day)) throw new Error('Choose a valid date.');
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Choose a valid time.');
  return { title, kind, day: day || null, time, location: str('location', 200), notes: str('notes', 4000), shared: kind === 'activity' || form.get('shared') === 'on' };
}
export function validTripDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
export function tripDate(day: string | null) {
  return day ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z')) : 'Date to come';
}
