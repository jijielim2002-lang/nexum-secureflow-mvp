-- Temporary workaround: allow server-side anon client to write to shipment_trackings
-- This is needed while SUPABASE_SERVICE_ROLE_KEY is not yet set correctly in .env.local
-- Once the real service_role key is in .env.local, you can remove this policy.

-- Enable RLS if not already enabled (safe to run twice)
ALTER TABLE shipment_trackings ENABLE ROW LEVEL SECURITY;

-- Drop the temp policy if it already exists
DROP POLICY IF EXISTS "allow_service_anon_writes" ON shipment_trackings;

-- Allow anon role full read/write (server-side API extraction bypass)
CREATE POLICY "allow_service_anon_writes" ON shipment_trackings
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Confirm
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename = 'shipment_trackings';
