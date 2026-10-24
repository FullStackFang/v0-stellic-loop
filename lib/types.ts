// Row shapes as the server reads them. Dates are 'YYYY-MM-DD' strings and
// timestamps ISO strings (see the type parsers in lib/db.ts).

export type Answer = "in" | "out" | "maybe";
export type Status = "open" | "on" | "closed";
export type DetailKind = "where" | "link" | "note";
export type Source =
  | "group_link"
  | "proposal_link"
  | "digest_link"
  | "on_text"
  | "one_more_text"
  | "maybe_nudge"
  | "fork"
  | "seed"
  | "direct";
export type EventType =
  | "proposal_posted"
  | "response"
  | "threshold_reached"
  | "proposal_idled"
  | "proposal_reopened"
  | "proposal_closed"
  | "detail_added"
  | "person_added"
  | "share_minted"
  | "fork_created"
  | "text_sent"
  | "board_created";

export type Board = {
  id: string;
  slug: string;
  name: string;
  tz: string;
  /** fixed: the stored dates; rolling: no dates, today and the next 13 days (lib/days.ts) */
  window_kind: "fixed" | "rolling";
  window_start: string | null;
  window_end: string | null;
};

export type Person = {
  id: string;
  phone: string;
  name: string;
  show_name: boolean;
  sms_opt_out: boolean;
};

export type Proposal = {
  id: string;
  board_id: string;
  poster_id: string | null;
  title: string;
  icon: string;
  detail: string | null;
  cost_text: string | null;
  time_text: string | null;
  needs_day: boolean;
  min_count: number | null;
  deadline: string | null;
  status: Status;
  on_day: string | null;
  on_at: string | null;
  locked_by: string | null;
  closed_at: string | null;
  version_of: string | null;
  created_at: string;
};

export type Response = {
  proposal_id: string;
  person_id: string;
  answer: Answer;
  days: string[];
  updated_at: string;
};

export type Detail = {
  id: string;
  proposal_id: string;
  kind: DetailKind;
  text: string;
  url: string | null;
  added_by: string | null;
  added_at: string;
};
