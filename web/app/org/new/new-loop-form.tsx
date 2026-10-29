"use client";

import { useActionState, useState } from "react";
import { createLoop, type CreateLoopState } from "@/app/org/new/actions";
import { WEEKDAY_OPTIONS } from "@/lib/organizer-shared";

const initialState: CreateLoopState = { status: "idle" };

const INPUT =
  "min-h-11 rounded-[var(--radius-md)] bg-sunken px-4 text-base text-primary placeholder:text-tertiary";

/** Create-loop form: weekly slot or one date, plus place, link, and the public slug. */
export function NewLoopForm() {
  const [state, formAction, pending] = useActionState(createLoop, initialState);
  const [schedule, setSchedule] = useState<"weekly" | "once">("weekly");

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="pls-kicker">Organizer</span>
        <h1 className="pls-display text-3xl font-bold leading-tight">New loop</h1>
        <p className="text-secondary">
          The weekday and time can&apos;t change once it exists; place and link can.
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Title</span>
        <input
          type="text"
          name="title"
          required
          maxLength={80}
          placeholder="CS 2110 Thursday problem sets"
          className={INPUT}
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">When</legend>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="schedule"
              value="weekly"
              checked={schedule === "weekly"}
              onChange={() => setSchedule("weekly")}
            />
            Weekly
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="schedule"
              value="once"
              checked={schedule === "once"}
              onChange={() => setSchedule("once")}
            />
            One date
          </label>
        </div>
      </fieldset>

      {schedule === "weekly" ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Weekday</span>
            <select name="weekday" required defaultValue="" className={INPUT}>
              <option value="" disabled>
                Pick a day
              </option>
              {WEEKDAY_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Start time</span>
            <input type="time" name="start_local" required className={INPUT} />
          </label>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Date and time</span>
          <input type="datetime-local" name="starts_at" required className={INPUT} />
          <span className="text-xs text-tertiary">In your campus time zone.</span>
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Duration (minutes)</span>
        <input
          type="number"
          name="duration_min"
          required
          min={15}
          max={480}
          step={5}
          defaultValue={90}
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Place</span>
        <input
          type="text"
          name="place"
          required
          maxLength={120}
          placeholder="Olin Library, 2nd floor group rooms"
          className={INPUT}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Link</span>
        <div className="flex items-center gap-2">
          <span className="pls-mono text-sm text-tertiary">/l/</span>
          <input
            type="text"
            name="slug"
            required
            maxLength={48}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="cs2110-thursdays"
            className={`${INPUT} pls-mono flex-1`}
          />
        </div>
        <span className="text-xs text-tertiary">Lower-case letters, digits, and hyphens.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">
          Event link <span className="font-normal text-tertiary">(optional)</span>
        </span>
        <input
          type="url"
          name="linked_url"
          inputMode="url"
          placeholder="https://lu.ma/…"
          className={INPUT}
        />
      </label>

      {state.status === "error" ? (
        <p role="alert" className="text-sm text-accent-strong">
          {state.message}
        </p>
      ) : null}

      <button type="submit" className="pls-btn pls-btn--primary pls-btn--block" disabled={pending}>
        {pending ? "Creating…" : "Create loop"}
      </button>
    </form>
  );
}
