-- ============================================================
-- Faza 1: Database migracije za Status Sirovine + RBAC
-- Prilagođeno postojećoj shemi (profiles i app_settings već postoje)
-- ============================================================

-- 1.1 Dodaj role kolonu na postojeću profiles tablicu
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'material', 'viewer'));

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Trigger: automatski kreiraj profil za novog korisnika
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role) VALUES (NEW.id, 'viewer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 1.2 Sirovine toggle u app_settings (koristi setting_name/setting_value)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Svi čitaju settings" ON app_settings;
DROP POLICY IF EXISTS "Admin mijenja settings" ON app_settings;

CREATE POLICY "Svi čitaju settings" ON app_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin mijenja settings" ON app_settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO app_settings (setting_name, setting_value)
VALUES ('sirovine_enabled', 'false')
ON CONFLICT (setting_name) DO NOTHING;


-- 1.3 Kolona status_sirovine na excel_work_orders
ALTER TABLE excel_work_orders
  ADD COLUMN IF NOT EXISTS status_sirovine TEXT DEFAULT NULL;

ALTER TABLE excel_work_orders DROP CONSTRAINT IF EXISTS excel_work_orders_status_sirovine_check;
ALTER TABLE excel_work_orders ADD CONSTRAINT excel_work_orders_status_sirovine_check
  CHECK (status_sirovine IS NULL OR status_sirovine IN ('IMA', 'NEMA', 'CEKA'));


-- 1.4 RLS na excel_work_orders
ALTER TABLE excel_work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all authenticated users" ON excel_work_orders;
DROP POLICY IF EXISTS "Svi čitaju naloge" ON excel_work_orders;
DROP POLICY IF EXISTS "Admin kreira" ON excel_work_orders;
DROP POLICY IF EXISTS "Admin ažurira" ON excel_work_orders;
DROP POLICY IF EXISTS "Admin briše" ON excel_work_orders;

CREATE POLICY "Svi čitaju naloge" ON excel_work_orders
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admin kreira" ON excel_work_orders
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin ažurira" ON excel_work_orders
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin briše" ON excel_work_orders
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- 1.5 RPC za material rolu
CREATE OR REPLACE FUNCTION update_status_sirovine(order_id UUID, new_status TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'material')
  ) THEN
    RAISE EXCEPTION 'Nemate dozvolu';
  END IF;

  IF new_status IS NOT NULL AND new_status NOT IN ('IMA', 'NEMA') THEN
    RAISE EXCEPTION 'Material rola može samo IMA ili NEMA';
  END IF;

  UPDATE excel_work_orders SET status_sirovine = new_status, updated_at = NOW()
  WHERE id = order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 1.6 RLS na excel_machines i machine_day_overrides
ALTER TABLE excel_machines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Svi čitaju strojeve" ON excel_machines;
DROP POLICY IF EXISTS "Admin upravlja strojevima" ON excel_machines;

CREATE POLICY "Svi čitaju strojeve" ON excel_machines
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin upravlja strojevima" ON excel_machines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

ALTER TABLE machine_day_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Svi čitaju overrides" ON machine_day_overrides;
DROP POLICY IF EXISTS "Admin upravlja overrides" ON machine_day_overrides;

CREATE POLICY "Svi čitaju overrides" ON machine_day_overrides
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Admin upravlja overrides" ON machine_day_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
