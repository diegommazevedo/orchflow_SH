-- v3_subtasks.sql — Sprint 6: Subtarefas
-- Executar APÓS v3_auth.sql

-- Adicionar parent_task_id em tasks
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID
  REFERENCES tasks(id) ON DELETE CASCADE;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id
  ON tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Profundidade máxima (1 nível) controlada no backend, não no banco
