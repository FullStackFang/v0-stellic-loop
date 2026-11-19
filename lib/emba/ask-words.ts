import type { AnswerWrite, AskChange, AskExtend, AskWrite } from './team-asks';

// What the site says when an ask, an answer or a change to an ask is not saved. Used by the ask pages and by the campus screen.

export type AskDeclined = Exclude<AskWrite | AnswerWrite | AskChange | AskExtend, { saved: true }>;
export const ASK_DENIED = 'This change could not be saved. Check your access, reload the page and try again.';
const caps = { writes_per_hour: 'You have made many changes this hour. Try again later.', open_asks: 'This group has 20 open asks. Ask someone to close one first.', own_open_asks: 'You have 5 open asks in this group. Close one first.' } as const;
const options = { too_few: 'This kind of ask needs at least 2 options.', too_many: 'An ask takes at most 10 options.', duplicate: 'Two of the options are the same.', not_for_text: 'A written-answer ask takes no options. Clear the options box.', not_for_done: 'Something to do takes no options. Clear the options box.', not_a_date: 'Each option of a dates ask is one day, written as YYYY-MM-DD.' } as const;
const closing = { past: 'The closing time must be in the future.', too_far: 'The closing time can be at most 60 days from now.' } as const;
const shape = { needs_text: 'This ask takes a short written answer.', needs_choice: 'Choose an option before sending.', one_only: 'This ask takes exactly one option.', done_only: 'This is only marked done.' } as const;
export const askWords = (result: AskDeclined): string => {
  switch (result.reason) {
    case 'busy': return 'Not saved. Other changes to this group were in progress. Try again in a moment.';
    case 'cap': return `Not saved. ${caps[result.cap]}`;
    case 'members_only': return 'You follow this group and can read it. Only members can do this.';
    case 'organizers_only': return ASK_DENIED;
    case 'options': return `Not saved. ${options[result.problem]}`;
    case 'closing_time': return `Not saved. ${closing[result.problem]}`;
    case 'unknown_event': return 'Not saved. That event is no longer current. Reload the page.';
    case 'unknown_ask': return 'Not saved. That ask is no longer here. Reload the page.';
    case 'closed': return 'Not saved. This ask has closed and takes no more answers.';
    case 'unknown_option': return 'Not saved. That option is not one of this ask\'s options. Reload the page.';
    case 'answer_shape': return `Not saved. ${shape[result.problem]}`;
    case 'not_in': return 'Not saved. This ask is for the members who are in on the idea. Say you are in first.';
    case 'not_yours': return 'Not saved. Only the person who asked, or an owner or organizer, can do this.';
    case 'day_ask': return 'Not saved. This ask settled the day of an idea, so it is not opened again.';
    case 'add_days': return ASK_DENIED;
    case 'reveal_fixed': return 'Not saved. Who sees which answer cannot change once someone has answered.';
    default: return ASK_DENIED;
  }
};
