-- v3_organization.sql — Sprint 8: Organização como entidade
-- Executar APÓS v3_ai_tokens.sql

-- Estender workspaces com identidade organizacional
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS legal_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS vertical VARCHAR(100),
  ADD COLUMN IF NOT EXISTS mission TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#89b4fa',
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
  ADD COLUMN IF NOT EXISTS size_range VARCHAR(50),
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;

-- Vocabulário customizado por organização
CREATE TABLE IF NOT EXISTS org_vocabulary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE
    REFERENCES workspaces(id) ON DELETE CASCADE,
  term_project VARCHAR(50) DEFAULT 'Projeto',
  term_task VARCHAR(50) DEFAULT 'Tarefa',
  term_sprint VARCHAR(50) DEFAULT 'Sprint',
  term_backlog VARCHAR(50) DEFAULT 'Backlog',
  term_member VARCHAR(50) DEFAULT 'Membro',
  term_client VARCHAR(50) DEFAULT 'Cliente',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed vocabulário para workspaces existentes
INSERT INTO org_vocabulary (workspace_id)
SELECT id FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;

-- Índice para vertical (filtro no marketplace futuro)
CREATE INDEX IF NOT EXISTS idx_workspaces_vertical
  ON workspaces(vertical)
  WHERE vertical IS NOT NULL;
