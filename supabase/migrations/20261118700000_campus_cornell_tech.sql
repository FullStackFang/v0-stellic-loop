-- Cornell Tech, as a second campus of Cornell (the swap on the map). Run by hand, like the others.
-- It has no email domains on purpose: nobody is placed here by their address. Which school it is part of is kept in
-- lib/campus/schools.ts, by slug. A Cornell person's own campus stays Ithaca, and this is one they may look at.
set lock_timeout='5s';
insert into campus(slug,name,tz,domains) values ('cornell-tech','Cornell Tech','America/New_York','{}') on conflict (slug) do nothing;
reset lock_timeout;
