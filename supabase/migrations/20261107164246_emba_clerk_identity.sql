-- Verified-email EMBA identities have no invented phone or legacy enrollment.
-- Existing non-null phones keep their unique/E.164 constraints.
alter table person alter column phone drop not null;
