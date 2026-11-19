-- One retry for a made animal. After the first drawing a person may have it drawn once more, see the two side by side,
-- and keep one.
--  * retry_of: on the second drawing, the first one. Unique, so a picture is retried once.
--  * let_go_at: when a picture was passed over. Its maker no longer sees it; the admin still does. The second drawing
--    starts let go, and stays so unless the person keeps it.
-- Apply after 20261118600000_campus_picture_shared.sql and BEFORE the code that reads these is deployed. The code from
-- before keeps working once this is applied. Rollback: drop the index and the two columns, after putting the old code back.
alter table campus_custom_picture add column if not exists retry_of uuid references campus_custom_picture(token) on delete set null;
alter table campus_custom_picture add column if not exists let_go_at timestamptz;
create unique index if not exists campus_custom_picture_retry on campus_custom_picture(retry_of) where retry_of is not null;
