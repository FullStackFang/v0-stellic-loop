import { displayUrl, httpUrl, type LinkPreview } from "@/lib/linkPreview";
import { formatMeeting, formatSlot, isOneOff, type LoopView } from "@/lib/loops";

/**
 * The facts of a loop: title, when (next meeting in the campus zone, plus the
 * weekly line when the loop has a slot), where, and the effective linked URL
 * as a plain link, with the cached preview above it when the caller passes
 * one. Presentational: the server component reads the preview. Nothing about
 * members.
 */
export function LoopFactsBlock({
  view,
  preview = null,
}: {
  view: LoopView;
  /** The `link_preview` row for `view.effectiveUrl`, or null when none is cached. */
  preview?: LinkPreview | null;
}) {
  const { loop, tz, next, effectiveUrl, ended, cancelled } = view;
  const slot = formatSlot(loop);
  const whenLabel = ended ? "Happened" : "Next";
  const when = next
    ? formatMeeting(next.starts_at, tz)
    : isOneOff(loop) && loop.single_occurrence_at
      ? formatMeeting(loop.single_occurrence_at, tz)
      : "To be announced";

  return (
    <div className="flex flex-col gap-2">
      <span className="pls-kicker">Loop</span>
      <h1 className="pls-display text-3xl font-bold leading-tight">{loop.title}</h1>
      <dl className="flex flex-col gap-1 text-secondary">
        {slot ? (
          <div className="flex gap-2">
            <dt className="sr-only">Weekly</dt>
            <dd>
              {slot} · {loop.duration_min} min
            </dd>
          </div>
        ) : null}
        {cancelled ? (
          <div className="flex gap-2">
            <dt className="sr-only">When</dt>
            <dd className="font-semibold text-accent-strong">Cancelled · {when}</dd>
          </div>
        ) : (
          <div className="flex gap-2">
            <dt className="font-semibold text-primary">{whenLabel}</dt>
            <dd className="pls-mono">{when}</dd>
          </div>
        )}
        <div className="flex gap-2">
          <dt className="font-semibold text-primary">Where</dt>
          <dd>{loop.place}</dd>
        </div>
        {effectiveUrl ? (
          <div className="flex gap-2">
            <dt className="font-semibold text-primary">Event</dt>
            <dd className="min-w-0">
              <EventLink url={effectiveUrl} preview={preview} />
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * The effective URL as a plain link showing host and path, with the cached
 * title (and image, https only) above it when the preview row is for this
 * exact URL. A stored value that is not http(s) renders as text, never a link.
 */
function EventLink({ url, preview }: { url: string; preview: LinkPreview | null }) {
  const parsed = httpUrl(url);
  if (!parsed) return <span className="break-all">{url}</span>;
  const cached = preview && preview.url === url ? preview : null;
  const title = cached?.title?.trim() || null;
  const image =
    cached && httpUrl(cached.image_url)?.protocol === "https:" ? cached.image_url : null;
  return (
    <div className="flex flex-col gap-1">
      {image ? (
        // Any third-party host, so next/image has no remote pattern to allow it by.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="max-h-40 w-full rounded-[var(--radius-md)] object-cover"
        />
      ) : null}
      {title ? <span className="font-semibold text-primary">{title}</span> : null}
      <a href={parsed.href} className="text-link break-all underline" rel="noopener noreferrer">
        {displayUrl(parsed)}
      </a>
    </div>
  );
}
