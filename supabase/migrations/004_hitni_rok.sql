-- Zamjena hitno boolean s hitni_rok datum
ALTER TABLE excel_work_orders ADD COLUMN IF NOT EXISTS hitni_rok DATE DEFAULT NULL;
UPDATE excel_work_orders SET hitni_rok = CURRENT_DATE WHERE hitno = true;
ALTER TABLE excel_work_orders DROP COLUMN IF EXISTS hitno;
CREATE INDEX IF NOT EXISTS idx_wo_hitni_rok ON excel_work_orders(hitni_rok) WHERE hitni_rok IS NOT NULL;
