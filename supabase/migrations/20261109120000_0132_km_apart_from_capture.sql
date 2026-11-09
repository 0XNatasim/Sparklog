-- 0132: per-employee option « km saisis à la main » (V2.4.240). On some phones the Field Service Bilan
-- screen is too short to show the « Distance réelle parcourue (km) » block in the same screenshot as the
-- times, so the screenshot check blocked Save for ever. When this flag is on, the missing km on the
-- screenshot is no longer a problem: the employee types the km by hand (the field stays required).
-- Like first_trip_unpaid (0070): managers write it through the existing profile policy and the employee
-- whitelist trigger keeps employees out of it. Default false = nothing changes for anyone.
alter table public.profiles
  add column if not exists km_apart_from_capture boolean not null default false;
