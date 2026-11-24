-- The Loopd browser extension (openspec loopd-browser-extension). Additive and safe to run twice.
-- Rollback: nothing reads these until they exist; the table and the column can stay.
set lock_timeout = '5s';
begin;

-- The page a feed event came from at its source (design D3), in the form the extension's lookup keys on. Used only to
-- recognise the event from its page: it is never shown, and a feed event still shows no link out.
alter table campus_listing add column if not exists source_url text;
do $$ begin
  alter table campus_listing add constraint campus_listing_source_url_https check (source_url is null or (source_url like 'https://%' and char_length(source_url) between 9 and 2000));
exception when duplicate_object then null; end $$;
create index if not exists campus_listing_source_url on campus_listing(campus_id, source_url) where source_url is not null;

-- The extension's own token (design D4). Only its hash is kept. It can look up an event, say "I'm in" and leave;
-- Disconnect revokes it.
create table if not exists campus_ext_token (
  token_hash text primary key check(char_length(token_hash) = 64),
  person_id uuid not null references person(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists campus_ext_token_person on campus_ext_token(person_id) where revoked_at is null;
alter table campus_ext_token enable row level security;
revoke all on campus_ext_token from public, anon, authenticated;

commit;
reset lock_timeout;
