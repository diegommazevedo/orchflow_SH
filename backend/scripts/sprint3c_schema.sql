-- Sprint 3C — Migração schema
-- Corre apenas se já tinhas o banco do Sprint 3 ou anterior.
-- Se for banco novo, o create_all no startup cria tudo automaticamente.

-- Tabela de perfis semânticos por usuário
CREATE TABLE IF NOT EXISTS user_semantic_profiles (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              VARCHAR UNIQUE NOT NULL,
    confidence_threshold FLOAT DEFAULT 0.85,
    trust_level          INTEGER DEFAULT 0,
    personal_dict        JSONB DEFAULT '{}',
    auto_execute_count   JSONB DEFAULT '{}',
    is_public            BOOLEAN DEFAULT FALSE,
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usp_user_id ON user_semantic_profiles(user_id);

-- Tabela de memórias semânticas
CREATE TABLE IF NOT EXISTS semantic_memories (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   UUID NOT NULL REFERENCES user_semantic_profiles(id) ON DELETE CASCADE,
    raw_input    TEXT NOT NULL,
    normalized   TEXT NOT NULL,
    action       VARCHAR NOT NULL,
    params_json  JSONB DEFAULT '{}',
    confidence   FLOAT DEFAULT 1.0,
    hit_count    INTEGER DEFAULT 1,
    embedding    JSONB,
    created_at   TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sm_profile_id  ON semantic_memories(profile_id);
CREATE INDEX IF NOT EXISTS idx_sm_action       ON semantic_memories(action);
CREATE INDEX IF NOT EXISTS idx_sm_hit_count    ON semantic_memories(hit_count DESC);
