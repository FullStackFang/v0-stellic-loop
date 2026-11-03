"use server";
import { db } from "@/lib/db";
import { sessionPersonId, setSession } from "@/lib/identity";
import { fail, type Fail } from "./results";

/** Name off: you still count everywhere, listed as "+1 anonymous". */
export async function setShowName(input: { show: boolean }): Promise<{ status: "ok" } | Fail> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  await db().query("update person set show_name = $2 where id = $1", [me, input.show === true]);
  await setSession(me);
  return { status: "ok" };
}

export async function setShareWithSteward(boardId: string, share: boolean): Promise<{ status: "ok" } | Fail> {
  const me = await sessionPersonId();
  if (!me) return fail("signed_out");
  if (typeof share !== "boolean") return fail("bad_value");
  const { rows } = await db().query("update board_person set share_with_steward = $3 where board_id::text = $1 and person_id = $2 returning person_id", [boardId, me, share]);
  if (!rows.length) return fail("not_found");
  await setSession(me);
  return { status: "ok" };
}
