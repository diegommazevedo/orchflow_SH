-- Executar APÓS v2_kanban_columns.sql
-- OrchFlow V2.1: definições em `custom_fields`, valores em `custom_field_values`
-- (equivalente semântico a custom_field_definitions / valores por task).

ALTER TABLE custom_field_values
  ADD COLUMN IF NOT EXISTS conformed_at TIMESTAMPTZ;

UPDATE custom_field_values
SET conformed_at = COALESCE(conformed_at, updated_at, created_at)
WHERE conformed_at IS NULL;
