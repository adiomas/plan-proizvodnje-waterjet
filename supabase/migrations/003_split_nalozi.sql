-- Podjela radnog naloga na dva stroja (split orders)
ALTER TABLE excel_work_orders
  ADD COLUMN split_group_id UUID DEFAULT NULL,
  ADD COLUMN split_label TEXT DEFAULT NULL;

ALTER TABLE excel_work_orders
  ADD CONSTRAINT wo_split_label_check
  CHECK (split_label IS NULL OR split_label IN ('A', 'B'));

ALTER TABLE excel_work_orders
  ADD CONSTRAINT wo_split_consistency
  CHECK (
    (split_label IS NULL AND split_group_id IS NULL) OR
    (split_label IS NOT NULL AND split_group_id IS NOT NULL)
  );

CREATE INDEX idx_wo_split_group ON excel_work_orders(split_group_id)
  WHERE split_group_id IS NOT NULL;
