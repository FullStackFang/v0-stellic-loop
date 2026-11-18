-- A posted plan may carry the link of the event page it was filled from (openspec loop-group-event-links, design D11).
-- Only a person's plan has one: feed events and the admin's hand-entered events do not.
alter table campus_listing add column link text
 check(link is null or (origin='member' and link like 'https://%' and char_length(link) between 9 and 2000));
create index campus_listing_link on campus_listing(campus_id,link) where link is not null;
