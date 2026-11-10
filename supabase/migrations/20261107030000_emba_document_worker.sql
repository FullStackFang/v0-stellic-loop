-- Durable bounded scheduling metadata; source lifecycle/authority stays in the service.
alter table emba_document_version
  add column worker_attempts integer not null default 0 check (worker_attempts >= 0),
  add column next_worker_at timestamptz not null default now();
create index emba_document_worker_pending on emba_document_version(next_worker_at,document_id,version)
  where state <> 'ready' and worker_attempts < 5;
