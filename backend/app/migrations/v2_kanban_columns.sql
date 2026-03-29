-- Executar ANTES de qualquer deploy V2 em banco com dados V1.x

-- PRÉ-REQUISITO: rodar seed de kanban_columns antes deste script
-- ou garantir que a tabela já tem linhas com slug válidos.
-- Ordem segura: 1) criar tabela kanban_columns, 2) seed, 3) este script.

UPDATE tasks SET status = 'todo'
WHERE status::text IN ('pending', 'open', 'todo', 'TaskStatus.todo', 'TaskStatus.pending');

UPDATE tasks SET status = 'in_progress'
WHERE status::text IN ('in_progress', 'doing', 'wip', 'TaskStatus.in_progress');

UPDATE tasks SET status = 'done'
WHERE status::text IN ('done', 'completed', 'closed', 'TaskStatus.done', 'TaskStatus.completed');

UPDATE tasks SET status = 'todo'
WHERE status::text NOT IN (
  SELECT DISTINCT slug::text FROM kanban_columns
);

ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(100);
