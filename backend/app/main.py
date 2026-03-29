import logging
import os
import re

# Garante que loggers da aplicação aparecem no terminal do uvicorn
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(name)s — %(message)s",
)

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy import text
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

logger = logging.getLogger(__name__)

from app.database import Base, engine, SessionLocal
from app.models import Project, Task, User  # noqa: F401
from app.models import UserSemanticProfile, SemanticMemory  # noqa: F401 — Sprint 3C
from app.models.activity import Comment, ActivityLog  # noqa: F401 — Sprint 5A
from app.models.sprint import Sprint, SprintTask  # noqa: F401 — Sprint 5B
from app.models.focus import FocusSession, ProductivitySnapshot  # noqa: F401 — Sprint 5C
from app.models.schema import CustomField, CustomFieldValue  # noqa: F401 — V2
from app.models.kanban import KanbanColumn  # noqa: F401 — V2
from app.models.template import VerticalTemplate  # noqa: F401 — V2
from app.models.workspace import Workspace, WorkspaceMember, WorkspaceInvite, OrgVocabulary  # noqa: F401 — V3 + Sprint 8
from app.models.refresh_token import RefreshToken  # noqa: F401 — V3
from app.models.ai_engine import AIEngine, AIWallet, AIUsageLog, AIWalletTransaction  # noqa: F401 — Sprint 7.5
from app.routers import projects, tasks
from app.routers.agent import router as agent_router
from app.routers.voice import router as voice_router
from app.routers.upload import router as upload_router
from app.routers.roi import router as roi_router
from app.routers.export import router as export_router
from app.routers.comments import comments_router, activity_router
from app.routers.sprints import router as sprints_router
from app.routers.focus import router as focus_router
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router
from app.routers.workspaces import router as workspaces_router
from app.routers.fields import router as fields_router
from app.routers.templates import router as templates_router
from app.routers.kanban import router as kanban_router
from app.routers.schema_agent import router as schema_agent_router
from app.routers.custom_fields import router as custom_fields_router
from app.routers.ai_tokens import router as ai_tokens_router

app = FastAPI(title="OrchFlow API", version="3.0.0")

# ── Rate limiter (slowapi) ────────────────────────────────────────────────────
from app.routers.auth import limiter  # noqa: E402
app.state.limiter = limiter


def _rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Muitas tentativas. Aguarde antes de tentar novamente."},
    )


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)


# ── Security headers ─────────────────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        return response


app.add_middleware(SecurityHeadersMiddleware)

# ── Payload size limit (10MB) ─────────────────────────────────────────────────
class LimitRequestSizeMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        max_size = 10 * 1024 * 1024  # 10MB
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > max_size:
            return JSONResponse(
                status_code=413,
                content={"detail": "Payload muito grande. Limite: 10MB."},
            )
        return await call_next(request)


app.add_middleware(LimitRequestSizeMiddleware)

_LOCALHOST_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5180",
]
# Produção Vercel — lista explícita (preflight não depende só do regex; deploys antigos falhavam sem isto)
_VERCEL_DEFAULT_ORIGINS = [
    "https://orchflow-sh.vercel.app",
]
# Regex: previews Vercel (orchflow-*) + Railway; fullmatch no Origin
_CORS_REGEX = (
    r"https://orchflow-sh\.vercel\.app"
    r"|https://orchflow-[\w.-]+\.vercel\.app"
    r"|https://.*\.up\.railway\.app"
)
_extra = os.getenv("ALLOWED_ORIGINS", "")
_extra_list = [o.strip().rstrip("/") for o in _extra.split(",") if o.strip()]
_all_origins = list(
    dict.fromkeys(_LOCALHOST_ORIGINS + _VERCEL_DEFAULT_ORIGINS + _extra_list)
)
_ORIGIN_SET = frozenset(_all_origins)
_compiled_cors_regex = re.compile(_CORS_REGEX)


def _cors_origin_allowed(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in _ORIGIN_SET:
        return True
    return _compiled_cors_regex.fullmatch(origin) is not None


class OrchFlowCorsGuardMiddleware(BaseHTTPMiddleware):
    """
    Camada mais externa: responde OPTIONS (preflight) com headers CORS explícitos
    e repõe ACAO em respostas que ainda não o tenham (erros 4xx/5xx, JSONResponse direto).
    Complementa o CORSMiddleware em cenários Railway/proxy.
    """

    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method == "OPTIONS" and _cors_origin_allowed(origin):
            req_h = request.headers.get("access-control-request-headers", "")
            allow_headers = req_h if req_h.strip() else "*"
            return Response(
                status_code=200,
                headers={
                    "Access-Control-Allow-Origin": origin,
                    "Access-Control-Allow-Credentials": "true",
                    "Access-Control-Allow-Methods": "DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT",
                    "Access-Control-Allow-Headers": allow_headers,
                    "Access-Control-Max-Age": "86400",
                },
            )
        response = await call_next(request)
        if _cors_origin_allowed(origin):
            h = response.headers
            if "access-control-allow-origin" not in h:
                h["Access-Control-Allow-Origin"] = origin
            if "access-control-allow-credentials" not in h:
                h["Access-Control-Allow-Credentials"] = "true"
        return response


logger.info(f"CORS explicit origins: {_all_origins}")
logger.info(f"CORS origin regex: {_CORS_REGEX}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_all_origins,
    allow_origin_regex=_CORS_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Último add_middleware = mais externo = corre antes de tudo (preflight estável)
app.add_middleware(OrchFlowCorsGuardMiddleware)


async def _validate_groq_key() -> None:
    """Testa a GROQ_API_KEY no startup. Não aborta o boot — apenas loga."""
    key = os.getenv("GROQ_API_KEY", "")
    if not key:
        logger.warning("⚠️  GROQ_API_KEY não configurada — uploads de contrato/planilha e voz estarão indisponíveis.")
        return
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=5.0,
            )
        if r.status_code == 401:
            logger.error(
                "❌ GROQ_API_KEY inválida ou revogada. "
                "Gere uma nova em https://console.groq.com/keys e atualize o .env."
            )
        elif r.status_code == 200:
            logger.info("✅ GROQ_API_KEY válida.")
        else:
            logger.warning(f"⚠️  Validação do Groq retornou status inesperado: {r.status_code}")
    except httpx.TimeoutException:
        logger.warning("⚠️  Timeout ao validar GROQ_API_KEY — Groq pode estar indisponível momentaneamente.")
    except Exception as exc:
        logger.warning(f"⚠️  Não foi possível validar GROQ_API_KEY: {exc}")


@app.on_event("startup")
async def validate_security_config():
    env = os.getenv("ENVIRONMENT", "development")
    disable_auth = os.getenv("DISABLE_AUTH", "false").lower()
    if env == "production" and disable_auth == "true":
        raise RuntimeError(
            "ERRO CRÍTICO: DISABLE_AUTH=true não é permitido "
            "em ambiente de produção. Boot abortado."
        )
    jwt_secret = os.getenv("JWT_SECRET", "change-me-in-production")
    if env == "production" and (
        not jwt_secret
        or jwt_secret == "change-me-in-production"
        or len(jwt_secret) < 32
    ):
        raise RuntimeError(
            "ERRO CRÍTICO: JWT_SECRET ausente, padrão ou muito curto em produção. "
            "Defina um segredo aleatório com pelo menos 32 caracteres. Boot abortado."
        )
    await _validate_groq_key()


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)

    # Auth schema drift fix for older production databases.
    try:
        with engine.connect() as conn:
            for col_def in [
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(200) UNIQUE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id VARCHAR(200) UNIQUE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE",
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ",
            ]:
                conn.execute(text(col_def))
            conn.commit()
    except Exception:
        pass

    if engine.dialect.name == "postgresql":
        try:
            with engine.connect() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(100) "
                        "USING (status::text)"
                    )
                )
                conn.commit()
        except Exception:
            pass

    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'blocked'"
                )
            )
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(
                text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP")
            )
            conn.execute(
                text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deleted_by VARCHAR")
            )
            conn.commit()
    except Exception:
        pass

    try:
        with engine.connect() as conn:
            conn.execute(
                text(
                    "ALTER TABLE custom_field_values ADD COLUMN IF NOT EXISTS conformed_at TIMESTAMP"
                )
            )
            conn.commit()
    except Exception:
        pass

    # Sprint 6: parent_task_id for subtasks
    try:
        with engine.connect() as conn:
            conn.execute(
                text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL")
            )
            conn.commit()
    except Exception:
        pass

    # Sprint 8: Organization identity fields
    try:
        with engine.connect() as conn:
            for col_def in [
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS legal_name VARCHAR(200)",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS vertical VARCHAR(100)",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS mission TEXT",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS logo_url TEXT",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) DEFAULT '#89b4fa'",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo'",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'pt-BR'",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS industry VARCHAR(100)",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS size_range VARCHAR(50)",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE",
                "ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0",
            ]:
                conn.execute(text(col_def))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS org_vocabulary (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                  term_project VARCHAR(50) NOT NULL DEFAULT 'Projeto',
                  term_task    VARCHAR(50) NOT NULL DEFAULT 'Tarefa',
                  term_sprint  VARCHAR(50) NOT NULL DEFAULT 'Sprint',
                  term_backlog VARCHAR(50) NOT NULL DEFAULT 'Backlog',
                  term_member  VARCHAR(50) NOT NULL DEFAULT 'Membro',
                  term_client  VARCHAR(50) NOT NULL DEFAULT 'Cliente',
                  updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                INSERT INTO org_vocabulary (workspace_id)
                SELECT id FROM workspaces
                ON CONFLICT (workspace_id) DO NOTHING
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_workspaces_vertical ON workspaces(vertical) WHERE vertical IS NOT NULL"
            ))
            conn.commit()
    except Exception:
        pass

    # Sprint 7.5: AI Token Manager tables
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_engines (
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
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_wallets (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  workspace_id UUID NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
                  balance_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
                  total_spent_usd NUMERIC(12,4) NOT NULL DEFAULT 0,
                  alert_threshold_usd NUMERIC(12,4) DEFAULT NULL,
                  created_at TIMESTAMPTZ DEFAULT NOW(),
                  updated_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_usage_logs (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
                  user_id UUID REFERENCES users(id),
                  engine_id UUID NOT NULL REFERENCES ai_engines(id),
                  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
                  agent_name VARCHAR(100),
                  input_tokens INTEGER NOT NULL DEFAULT 0,
                  output_tokens INTEGER NOT NULL DEFAULT 0,
                  cost_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
                  context VARCHAR(200),
                  created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS ai_wallet_transactions (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  wallet_id UUID NOT NULL REFERENCES ai_wallets(id) ON DELETE CASCADE,
                  amount_usd NUMERIC(12,4) NOT NULL,
                  type VARCHAR(20) NOT NULL CHECK (type IN ('credit','debit','refund')),
                  description TEXT,
                  reference_id VARCHAR(200),
                  created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_usage_workspace ON ai_usage_logs(workspace_id, created_at DESC)"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_ai_usage_task ON ai_usage_logs(task_id) WHERE task_id IS NOT NULL"
            ))
            # Seed engines (idempotente via ON CONFLICT DO NOTHING)
            conn.execute(text("""
                INSERT INTO ai_engines (name, slug, provider, model_id,
                  cost_per_1k_input_tokens, cost_per_1k_output_tokens, capabilities)
                VALUES
                  ('Groq — LLaMA 3.3 70B','groq-llama-70b','groq','llama-3.3-70b-versatile',
                   0.0006, 0.0006, '["chat","intent","classification"]'),
                  ('Groq — Whisper','groq-whisper','groq','whisper-large-v3-turbo',
                   0.0002, 0, '["transcription"]'),
                  ('OpenAI — GPT-4o','openai-gpt4o','openai','gpt-4o',
                   0.005, 0.015, '["chat","reasoning","vision"]'),
                  ('Anthropic — Claude Sonnet','anthropic-claude-sonnet','anthropic','claude-sonnet-4-6',
                   0.003, 0.015, '["chat","reasoning","analysis","long-context"]')
                ON CONFLICT (slug) DO NOTHING
            """))
            conn.commit()
    except Exception:
        pass

    # Sprint 7: sprint type + recurrence columns
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'standard'"))
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS recurrence_unit VARCHAR(20) DEFAULT NULL"))
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS recurrence_interval INTEGER DEFAULT NULL"))
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS auto_create BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS parent_sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL"))
            conn.execute(text("ALTER TABLE sprints ADD COLUMN IF NOT EXISTS sequence_number INTEGER DEFAULT 1"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT FALSE"))
            conn.execute(text("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_template_id UUID REFERENCES tasks(id) ON DELETE SET NULL"))
            conn.commit()
    except Exception:
        pass

    # V3: multi-tenant workspace_id on projects (ADD COLUMN idempotente para DBs antigos)
    try:
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id UUID "
                "REFERENCES workspaces(id) ON DELETE SET NULL"
            ))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS idx_projects_workspace_id "
                "ON projects(workspace_id) WHERE workspace_id IS NOT NULL"
            ))
            conn.commit()
    except Exception:
        pass

    db = SessionLocal()
    try:
        from app.v2_seed import seed_vertical_templates, backfill_all_projects_kanban

        seed_vertical_templates(db)
        backfill_all_projects_kanban(db)
    except Exception as e:
        logger.warning(f"⚠️  Seed/backfill falhou (não crítico, continuando boot): {e}")
    finally:
        db.close()


app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(agent_router, prefix="/api/agent", tags=["agent"])
app.include_router(voice_router, prefix="/api/voice", tags=["voice"])
app.include_router(upload_router, prefix="/api/upload", tags=["upload"])
app.include_router(roi_router, prefix="/api/roi", tags=["roi"])
app.include_router(export_router, prefix="/api/export", tags=["export"])
app.include_router(comments_router, prefix="/api/comments", tags=["comments"])
app.include_router(activity_router, prefix="/api/activity", tags=["activity"])
app.include_router(sprints_router, prefix="/api/sprints", tags=["sprints"])
app.include_router(focus_router, prefix="/api/focus", tags=["focus"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(workspaces_router, prefix="/api", tags=["workspaces"])
app.include_router(fields_router, prefix="/api/fields", tags=["fields"])
app.include_router(templates_router, prefix="/api/templates", tags=["templates"])
app.include_router(kanban_router, prefix="/api/kanban", tags=["kanban"])
app.include_router(schema_agent_router, prefix="/api", tags=["schema_agent"])
app.include_router(custom_fields_router, prefix="/api", tags=["custom_fields"])
app.include_router(ai_tokens_router, prefix="/api", tags=["ai_tokens"])


@app.get("/")
def root():
    return {"status": "OrchFlow online", "version": "3.0.0"}
