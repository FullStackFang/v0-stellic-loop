-- Run by hand on a live database: give up after 5 seconds instead of queueing behind a long transaction.
set lock_timeout='5s';

-- Saving a picture out of the app (openspec loop-save-picture): a made animal is kept large as well, so it can be
-- saved sharp. `large` is the drawing with its empty edge cut away, the longer side up to 1024. An animal made before
-- this has none, and is saved from its 192px picture, made larger.
-- Apply after 20261119400000_campus_subscribe_ask.sql. The code works before and after this is applied: until it is,
-- no large drawing is kept. Rollback: alter table campus_custom_picture drop column large.
alter table campus_custom_picture add column if not exists large bytea;
