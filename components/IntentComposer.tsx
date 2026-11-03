"use client";
import { useEffect, useRef, useState } from "react";
import { parseIntent, serializeIntent, RHYTHMS, type IntentDraft, type Intent } from "@/lib/intent";
import { shortLabel, mon } from "@/lib/days";

type Field = "title" | "day" | "time" | "place" | "rhythm" | number | "preference";
const labels = { title: "Activity", day: "Day", time: "Time", place: "Place", rhythm: "Rhythm", preference: "Preference" };

export function IntentComposer({ value, onChange, days, disabled = false, fixedTitle = false }: {
  value: string; onChange: (value: string) => void; days: string[]; disabled?: boolean; fixedTitle?: boolean;
}) {
  const draft = parseIntent(value, days);
  const [editing, setEditing] = useState<Field | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const source = useRef<HTMLTextAreaElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing !== null) editor.current?.querySelector<HTMLElement>("input,button")?.focus(); }, [editing]);
  const label = typeof editing === "number" ? "Preference" : editing === null ? "" : labels[editing];

  function open(field: Field, button: HTMLButtonElement) {
    opener.current = button;
    setEditing(field); setEditError("");
    setEditValue(typeof field === "number" ? draft.intent.preferences[field] : field === "preference" ? "" : field === "rhythm" ? draft.intent.rhythm : draft[field]);
  }
  function close() { setEditing(null); setEditError(""); (fixedTitle ? opener.current?.isConnected ? opener.current : root.current?.querySelector<HTMLElement>(".intent-add") : source.current)?.focus(); }
  function commit(next: IntentDraft) { onChange(serializeIntent(next)); close(); }
  function apply() {
    if (editing === null) return;
    const text = editValue.trim().replace(/\s+/g, " ");
    if (editing === "preference" || typeof editing === "number") {
      if (!text || text.length > 60 || /\s@/.test(text)) return setEditError("Use 1–60 characters. Add separate @ pins one at a time.");
      const preferences = [...draft.intent.preferences];
      if (typeof editing === "number") preferences[editing] = text; else preferences.push(text.replace(/^@/, ""));
      if (preferences.length > 12) return setEditError("Use up to 12 preferences.");
      commit({ ...draft, intent: { ...draft.intent, preferences } });
    } else if (editing === "title" || editing === "time" || editing === "place") {
      if ((editing === "title" && !text) || text.length > (editing === "title" ? 80 : editing === "time" ? 40 : 200) || /\s@/.test(text)) return setEditError("Keep this short; add @ preferences separately.");
      commit({ ...draft, [editing]: text });
    }
  }
  function field(field: Field, text: string, extraClass = "") {
    return <button className={`intent-pin ${extraClass}`} type="button" disabled={disabled} onClick={e => open(field, e.currentTarget)} aria-label={`Edit ${typeof field === "number" ? `preference ${text}` : labels[field]}`}>{text}</button>;
  }

  return <div ref={root} className="intent-composer">
    {!fixedTitle ? <div className="intent-writing">
      <label htmlFor="intent-text">I’m up for</label>
      <textarea ref={source} id="intent-text" rows={3} maxLength={1201} value={value} disabled={disabled} onChange={e => onChange(e.target.value)} placeholder={"Dinner Thursdays\n@ramen @after 7"} aria-describedby="intent-help" />
      <p id="intent-help">Write freely. Start each preference with @.</p>
    </div> : null}
    <div className="intent-read">
      <div className="intent-label">{fixedTitle ? "Your intent" : "What you’ll post"}</div>
      {fixedTitle ? <strong className="intent-activity">{draft.title}</strong> : field("title", draft.title || "Add an activity", "intent-activity")}
      <div className="intent-pins">
        {field("day", draft.day ? `${shortLabel(draft.day)} ${mon(draft.day)}` : "Any day")}
        {field("rhythm", RHYTHMS[draft.intent.rhythm])}
        {field("time", draft.time || "+ time")}
        {field("place", draft.place || "+ place")}
      </div>
      <div className="intent-prefs-label">Preferences <span>visible to the space</span></div>
      <div className="intent-pins">
        {draft.intent.preferences.map((pin, i) => <span className="intent-pin-pair" key={i}>{field(i, `@${pin}`)}<button type="button" disabled={disabled} aria-label={`Remove preference ${pin}`} onClick={() => commit({ ...draft, intent: { ...draft.intent, preferences: draft.intent.preferences.filter((_, index) => index !== i) } })}>×</button></span>)}
        {field("preference", "+ preference", "intent-add")}
      </div>
      <p className="intent-hint">{draft.intent.preferences.length ? "Tap a pin to edit. × removes it." : "No extra preferences. Unspecified details stay open."}</p>
      {draft.intent.rhythm !== "once" ? <p className="intent-hint">A rhythm you’d like. Post each next plan with a fresh count.</p> : null}
    </div>
    {editing !== null && !disabled ? <div ref={editor} className="intent-editor" role="group" aria-label={`Edit ${label}`} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
      <label htmlFor="intent-edit-value">{label}</label>
      {editing === "day" ? <div className="days"><button type="button" aria-pressed={!draft.day} onClick={() => commit({ ...draft, day: "" })}>Any day</button>{days.map(day => <button type="button" key={day} aria-pressed={day === draft.day} onClick={() => commit({ ...draft, day })}>{shortLabel(day)}</button>)}</div>
        : editing === "rhythm" ? <div className="days">{Object.entries(RHYTHMS).map(([key, name]) => <button type="button" key={key} aria-pressed={key === draft.intent.rhythm} onClick={() => commit({ ...draft, intent: { ...draft.intent, rhythm: key as Intent["rhythm"] } })}>{name}</button>)}</div>
          : <input id="intent-edit-value" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(); } if (e.key === "Escape") { e.preventDefault(); close(); } }} maxLength={editing === "title" ? 80 : editing === "place" ? 200 : editing === "time" ? 40 : 60} placeholder={editing === "time" ? "7:30pm" : editing === "place" ? "Hoi An" : "Your preference"} />}
      {editError ? <p role="alert">{editError}</p> : null}
      <div className="intent-editor-actions">{editing !== "day" && editing !== "rhythm" ? <button className="ghost" type="button" onClick={apply}>Apply</button> : null}<button className="alt" type="button" onClick={close}>Cancel</button></div>
    </div> : null}
    {value.trim() && draft.errors.length ? <p className="err" role="alert">{draft.errors[0]}</p> : null}
  </div>;
}
