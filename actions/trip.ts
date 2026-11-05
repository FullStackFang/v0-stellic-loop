'use server';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { viewer } from '@/lib/viewer';
import { boardBySlug, isUuid } from '@/lib/load';
import { joinBoard, withIdentity, setSession, type IdentityInput } from '@/lib/identity';
import { boardName, boardTz } from '@/lib/ops';
import { createTripAs, getTrip } from '@/lib/trip-store';
import { limited } from '@/lib/ratelimit';
import { fail, fromWho } from './results';
import { parseTripItem, validTripDay } from '@/lib/trip';

export async function startTrip(input: { board: string; tz?: string } & IdentityInput) {
  const name = boardName(input.board);
  if (!name) return fail('need_board_name');
  if (await limited('board') || await limited('identify', input.phone ?? undefined)) return fail('rate_limited');
  const tz = boardTz(input.tz);
  const out = await db().tx(async q => {
    const who = await withIdentity(q, input, { boardId: null, pending: { kind: 'trip', name, tz } });
    if (who.kind !== 'session') return fromWho(who);
    const result = await createTripAs(q, who.personId, name, tz);
    if (result.status !== 'ok') return fail(result.error);
    return { ...result, personId: who.personId };
  });
  if (out.status === 'ok') await setSession(out.personId);
  return out;
}
export async function joinTrip(slug: string, input: IdentityInput) {
  const board = await boardBySlug(db(), slug);
  if (!board || !await getTrip(db(), board.id)) return fail('not_found');
  if (await limited('identify', input.phone ?? undefined)) return fail('rate_limited');
  return db().tx(async q => {
    const who = await withIdentity(q, input, { boardId: board.id, pending: { kind: 'join_trip', boardId: board.id, slug } });
    if (who.kind !== 'session') return fromWho(who);
    await joinBoard(q, board.id, who.personId, null, { source: 'direct', shareId: null });
    return { status: 'ok' as const };
  });
}
export async function changeTrip(slug: string, operation: 'settings' | 'item' | 'delete' | 'rsvp', form: FormData) {
  const q = db(), me = await viewer(q), board = await boardBySlug(q, slug);
  if (!me) return { error: 'Sign in to add your plans.' };
  if (!board) return { error: 'This trip could not be found.' };
  const trip = await getTrip(q, board.id);
  if (!trip) return { error: 'This trip could not be found.' };
  try {
    await q.tx(async tx => {
      if (operation === 'settings') {
        if (trip.owner_id !== me.id) throw new Error('Only the organizer can edit trip details.');
        const start = String(form.get('start') ?? ''), end = String(form.get('end') ?? '');
        if ((start && !validTripDay(start)) || (end && !validTripDay(end)) || (start && end && end < start)) throw new Error('Check the trip dates.');
        await tx.query('update trip set destination = $2, start_day = $3, end_day = $4 where board_id = $1', [board.id, String(form.get('destination') ?? '').trim().slice(0, 200), start || null, end || null]);
      } else if (operation === 'item') {
        const item = parseTripItem(form);
        await tx.query('insert into trip_item (board_id, owner_id, kind, title, day, time, location, notes, shared) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [board.id, me.id, item.kind, item.title, item.day, item.time, item.location, item.notes, item.shared]);
      } else {
        const id = form.get('id');
        if (!isUuid(id)) throw new Error('This plan could not be found.');
        if (operation === 'delete') {
          const { rows } = await tx.query('delete from trip_item where id=$1 and board_id=$2 and owner_id=$3 returning id', [id, board.id, me.id]);
          if (!rows.length) throw new Error('Only the person who added this can remove it.');
        } else if (operation === 'rsvp') {
          const { rows } = await tx.query("select id from trip_item where id=$1 and board_id=$2 and kind='activity' and shared for update", [id, board.id]);
          if (!rows.length) throw new Error('This activity is no longer available.');
          if (form.get('join') === 'yes') await tx.query('insert into trip_rsvp (item_id,person_id) values ($1,$2) on conflict do nothing', [id, me.id]);
          else await tx.query('delete from trip_rsvp where item_id=$1 and person_id=$2', [id, me.id]);
        } else throw new Error('Unknown trip action.');
      }
      await joinBoard(tx, board.id, me.id, null, { source: 'direct', shareId: null });
    });
    revalidatePath(`/trip/${slug}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && !('code' in error)) return { error: error.message };
    return { error: 'Could not save. Please try again.' };
  }
}
