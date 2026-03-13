-- Dodaj novu rolu "tehnicka_priprema" u profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'material', 'viewer', 'tehnicka_priprema'));

-- RLS policy: tehnicka_priprema može INSERT naloge
CREATE POLICY "tehnicka_priprema_insert" ON excel_work_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tehnicka_priprema')
  );

-- RLS policy: tehnicka_priprema može UPDATE naloge
-- (ograničenje na samo rn_id i rok_isporuke enforceano na aplikacijskom nivou)
CREATE POLICY "tehnicka_priprema_update" ON excel_work_orders
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tehnicka_priprema')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tehnicka_priprema')
  );
