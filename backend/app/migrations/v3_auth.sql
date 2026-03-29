-- Sprint 5 — Multi-usuário + Auth
-- Executar ANTES do deploy da versão 3.0.0

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  invited_by UUID REFERENCES users(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email VARCHAR(200) UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(200),
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(200) UNIQUE,
  ADD COLUMN IF NOT EXISTS github_id VARCHAR(200) UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id);

INSERT INTO workspaces (id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Workspace Padrão',
  'workspace-padrao'
)
ON CONFLICT (slug) DO NOTHING;

UPDATE projects
SET workspace_id = '00000000-0000-0000-0000-000000000001'
WHERE workspace_id IS NULL;

ALTER TABLE projects
  ALTER COLUMN workspace_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS workspace_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email VARCHAR(200) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  token VARCHAR(200) NOT NULL UNIQUE,
  invited_by UUID REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(200) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

-- Verificação de integridade pós-migração
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM projects WHERE workspace_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Migração incompleta: projetos sem workspace_id encontrados.';
  END IF;
END $$;
