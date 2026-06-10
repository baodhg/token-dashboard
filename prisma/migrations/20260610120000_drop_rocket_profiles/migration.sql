-- The rocket shop moved to the shared race-server DB (race_shop_profiles /
-- race_purchases). The per-machine local table is no longer read or written, so
-- drop it. daily_balances (created in the same earlier migration) is untouched.
DROP TABLE IF EXISTS "rocket_profiles";
