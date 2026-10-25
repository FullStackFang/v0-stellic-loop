-- Texts through Twilio (quorum-board-sms). All additive.

-- The one-more text fires once per proposal, like threshold_reached. Postgres
-- refuses a new enum value in the transaction that adds it, so its unique
-- index is 0007_sms_once.sql: run this file, then that one.
alter type event_type add value if not exists 'one_more_sent';

-- Links in texts are just /m/<token>: the token carries where it lands and its source.
alter table magic_token
  add column if not exists to_path text,
  add column if not exists source source;
