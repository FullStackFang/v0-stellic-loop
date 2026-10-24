"use client";
import { useToast } from "./Toast";

/** A new board's one action besides posting: copy its link for the group chat. */
export function CopyLink({ slug }: { slug: string }) {
  const toast = useToast();
  return (
    <button
      className="ghost"
      onClick={async () => {
        const url = `${location.origin}/b/${slug}`;
        try {
          await navigator.clipboard.writeText(url);
          toast(<>Link copied: <b>{url.replace(/^https?:\/\//, "")}</b>. Pin it in your group chat.</>);
        } catch {
          toast(<>Copy this link: <b>{url}</b></>);
        }
      }}
    >
      Copy the link
    </button>
  );
}
