-- Sprint 3: colunas novas em bases já existentes (PostgreSQL).
-- Rode uma vez se as tabelas users/tasks já existiam antes do Sprint 3.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS nickname VARCHAR,
  ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'member';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS due_date_iso VARCHAR,
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id);
