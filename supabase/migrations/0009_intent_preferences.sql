-- Additive: old proposals and old application versions remain compatible.
alter table proposal add column intent jsonb not null
  default '{"rhythm":"once","preferences":[]}'::jsonb;
alter table proposal add constraint proposal_intent_shape check (
  jsonb_typeof(intent) = 'object'
  and intent ? 'rhythm' and intent ? 'preferences'
  and jsonb_typeof(intent->'rhythm') = 'string'
  and intent->>'rhythm' in ('once', 'weekly', 'fortnightly')
  and jsonb_typeof(intent->'preferences') = 'array'
  and jsonb_array_length(intent->'preferences') <= 12
);
