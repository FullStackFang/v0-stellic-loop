-- One one-more text per proposal (0006_sms.sql adds the event type).
create unique index if not exists event_one_more_once on event (proposal_id) where type = 'one_more_sent';
