-- Dodaj hitno boolean flag za prioritetno raspoređivanje
ALTER TABLE excel_work_orders ADD COLUMN IF NOT EXISTS hitno BOOLEAN DEFAULT false;
