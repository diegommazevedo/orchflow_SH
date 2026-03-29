-- v3_sprint_types.sql — Sprint 7: Sprint tipada (recorrente + encaixe)
-- Executar APÓS v3_subtasks.sql

-- Tipo de sprint
DO $$ BEGIN
  CREATE TYPE sprint_type AS ENUM ('standard', 'recorrente', 'encaixe');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Recorrência
DO $$ BEGIN
  CREATE TYPE recurrence_unit AS ENUM ('daily', 'weekly', 'monthly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Estender tabela sprints
ALTER TABLE sprints
  ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS recurrence_unit VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS auto_create BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS parent_sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1;

-- Estender tasks com flag de recorrência
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Índices
CREATE INDEX IF NOT EXISTS idx_sprints_type ON sprints(type);
CREATE INDEX IF NOT EXISTS idx_sprints_parent ON sprints(parent_sprint_id) WHERE parent_sprint_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_recurring ON tasks(is_recurring) WHERE is_recurring = TRUE;
