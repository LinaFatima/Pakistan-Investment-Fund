-- Run once in the Supabase SQL Editor AFTER the new code is deployed and
-- SUPABASE_SERVICE_ROLE_KEY + ADMIN_SESSION_SECRET are set in Vercel.
-- Safe to re-run.

-- 1. users: no client access at all (only the server's service_role key can read it)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.users FROM anon, authenticated;

-- 2. Public data: anyone can read, nobody can write from the browser
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies', 'current_prices', 'nav_history', 'price_history',
    'daily_closes', 'fund_metadata', 'historical_nav', 'portfolio_data'
  ] LOOP
    -- only real tables (relkind 'r'); views are skipped
    IF to_regclass('public.' || t) IS NOT NULL
       AND (SELECT relkind FROM pg_class WHERE oid = to_regclass('public.' || t)) = 'r' THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "Public read" ON public.%I', t);
      EXECUTE format('CREATE POLICY "Public read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- 3. Check: every table should show rls_enabled = true
SELECT tablename, rowsecurity AS rls_enabled
FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
