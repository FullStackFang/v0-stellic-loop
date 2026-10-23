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
