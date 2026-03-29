-- v3_ai_tokens.sql — Sprint 7.5: AI Token Manager
-- Executar APÓS v3_sprint_types.sql

-- Motores de IA disponíveis
CREATE TABLE ai_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(50) NOT NULL UNIQUE,
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(200) NOT NULL,
  cost_per_1k_input_tokens NUMERIC(10,6) NOT NULL DEFAULT 0,
  cost_per_1k_output_tokens NUMERIC(10,6) NOT NULL DEFAULT 0,
  capabilities JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carteira de tokens por workspace
CREATE TABLE ai_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL UNIQUE
    REFERENCES workspaces(id) ON DELETE CASCADE,
  balance_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  total_spent_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
  alert_threshold_usd NUMERIC(12,4) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Log de uso por chamada
CREATE TABLE ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL
    REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  engine_id UUID NOT NULL
    REFERENCES ai_engines(id),
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  agent_name VARCHAR(100),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  context VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recarga de créditos / débitos
CREATE TABLE ai_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL
    REFERENCES ai_wallets(id) ON DELETE CASCADE,
  amount_usd NUMERIC(12,4) NOT NULL,
  type VARCHAR(20) NOT NULL
    CHECK (type IN ('credit','debit','refund')),
  description TEXT,
  reference_id VARCHAR(200),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_ai_usage_workspace
  ON ai_usage_logs(workspace_id, created_at DESC);
CREATE INDEX idx_ai_usage_task
  ON ai_usage_logs(task_id)
  WHERE task_id IS NOT NULL;

-- Seed: motores disponíveis
INSERT INTO ai_engines
  (name, slug, provider, model_id,
   cost_per_1k_input_tokens,
   cost_per_1k_output_tokens, capabilities)
VALUES
(
  'Groq — LLaMA 3.3 70B', 'groq-llama-70b',
  'groq', 'llama-3.3-70b-versatile',
  0.0006, 0.0006,
  '["chat","intent","classification"]'
),
(
  'Groq — Whisper', 'groq-whisper',
  'groq', 'whisper-large-v3-turbo',
  0.0002, 0,
  '["transcription"]'
),
(
  'OpenAI — GPT-4o', 'openai-gpt4o',
  'openai', 'gpt-4o',
  0.005, 0.015,
  '["chat","reasoning","vision"]'
),
(
  'Anthropic — Claude Sonnet', 'anthropic-claude-sonnet',
  'anthropic', 'claude-sonnet-4-6',
  0.003, 0.015,
  '["chat","reasoning","analysis","long-context"]'
);
