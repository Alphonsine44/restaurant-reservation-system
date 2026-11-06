-- Maison Verre: the ONE schema change this version relies on.
-- It is additive and non-destructive (no data is dropped or overwritten).
--
-- Run this once in Supabase SQL Editor after checking the actual table schema.
-- The backend now defaults to ddl-auto=validate, so it will NOT silently alter tables.

alter table public.reservations
  add column if not exists status varchar(20) not null default 'CONFIRMED';

-- Optional: starter tables so online booking works straight away.
-- Online booking needs at least one table with status 'AVAILABLE'. You can instead add them in
-- the admin dashboard (Add table). Only inserts rows that do not already exist; deletes nothing.
-- Uncomment to use.
--
-- insert into public.restaurant_tables (id, table_number, capacity, status)
-- select gen_random_uuid(), v.n, v.c, 'AVAILABLE'
-- from (values ('T-01',2),('T-02',2),('T-03',4),('T-04',4),('T-05',6)) as v(n,c)
-- where not exists (select 1 from public.restaurant_tables t where t.table_number = v.n);
