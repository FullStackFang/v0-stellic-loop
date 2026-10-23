import "server-only";
import type { Q } from "./db";
import { sessionPersonId } from "./identity";
import { personById } from "./load";
import type { Viewer } from "./view";

/** The signed-in person for rendering, or null. A cookie for a deleted person counts as none. */
export async function viewer(q: Q): Promise<(Viewer & { name: string }) | null> {
  const id = await sessionPersonId();
  if (!id) return null;
  const p = await personById(q, id);
  return p ? { id: p.id, show_name: p.show_name, name: p.name } : null;
}
