"use client";
import { rosterText, type PersonRow } from "@/lib/view";
import { useToast } from "./Toast";

/** Copies who's in as plain text. Client only: no server call, no event. */
export function CopyNames({ title, people, viewerName }: { title: string; people: { in: PersonRow[]; maybe: PersonRow[] }; viewerName: string | null }) {
  const toast = useToast();
  return (
    <button
      className="ghost"
      onClick={async () => {
        const text = rosterText(title, people, viewerName);
        try {
          await navigator.clipboard.writeText(text);
          toast(<>Copied the list · <b>{people.in.length} in</b></>);
        } catch {
          toast(text);
        }
      }}
    >
      Copy names
    </button>
  );
}
