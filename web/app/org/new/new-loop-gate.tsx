import { notFound } from "next/navigation";
import { requirePerson } from "@/lib/auth";
import { isAllowlistedOrganizer } from "@/lib/organizer";
import { NewLoopForm } from "@/app/org/new/new-loop-form";

/**
 * Requires a signed-in, named person and shows "not found" to anyone not on
 * `ORGANIZER_EMAILS`. The action re-checks both before writing.
 */
export async function NewLoopGate() {
  const person = await requirePerson("/org/new");
  if (!isAllowlistedOrganizer(person.email)) notFound();
  return <NewLoopForm />;
}
