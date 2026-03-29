"""
Seed de desenvolvimento — cria usuário admin e workspace padrao.

Usa psycopg2 direto (sem ORM) para evitar problemas de configuração
de mapper ao importar modelos com relacionamentos auto-referentes.

Uso:
    cd backend
    python scripts/create_admin.py

Idempotente: se o usuário/workspace ja existir, apenas garante o role admin.
"""
import sys
import os
import uuid
from datetime import datetime
from urllib.parse import parse_qsl, unquote, urlsplit

# ── Carregar .env manualmente (sem depender do app) ───────────────────────────
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.exists(env_path):
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

import psycopg2
from psycopg2.extras import RealDictCursor

try:
    import bcrypt
    def hash_pw(pw: str) -> str:
        return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()
except ImportError:
    from passlib.context import CryptContext
    _ctx = CryptContext(schemes=["bcrypt"])
    def hash_pw(pw: str) -> str:
        return _ctx.hash(pw)

# ── Configuração ──────────────────────────────────────────────────────────────

ADMIN_EMAIL    = "admin@orchflow.dev"
ADMIN_PASSWORD = "Admin123!"
ADMIN_NAME     = "Admin OrchFlow"
WORKSPACE_NAME = "OrchFlow Dev"
WORKSPACE_SLUG = "orchflow-dev"

# ── Helpers ───────────────────────────────────────────────────────────────────

def uid() -> str:
    return str(uuid.uuid4())

def now() -> str:
    return datetime.utcnow().isoformat()


def connect_db(db_url: str):
    """
    Conecta ao Postgres sem depender do parser DSN do psycopg2.
    Isso evita falhas de decoding quando a senha do DATABASE_URL
    tem caracteres especiais ou percent-encoding.
    """
    normalized = (
        db_url
        .replace("postgresql+psycopg2://", "postgresql://")
        .replace("postgres://", "postgresql://", 1)
    )
    parsed = urlsplit(normalized)
    if parsed.scheme not in ("postgresql", "postgres"):
        raise ValueError(f"Scheme de DATABASE_URL não suportado: {parsed.scheme}")

    conn_kwargs = {
        "dbname": unquote(parsed.path.lstrip("/")),
        "user": unquote(parsed.username) if parsed.username else None,
        "password": unquote(parsed.password) if parsed.password else None,
        "host": parsed.hostname,
        "port": parsed.port,
    }
    for key, value in parse_qsl(parsed.query, keep_blank_values=True):
        conn_kwargs[key] = value

    clean_kwargs = {k: v for k, v in conn_kwargs.items() if v is not None}
    return psycopg2.connect(**clean_kwargs)

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("[ERRO] DATABASE_URL nao encontrada no .env")
        sys.exit(1)

    conn = connect_db(db_url)
    conn.autocommit = False
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # ── 1. Usuario ──────────────────────────────────────────────────────
        cur.execute("SELECT id FROM users WHERE email = %s", (ADMIN_EMAIL,))
        row = cur.fetchone()

        if row is None:
            user_id = uid()
            cur.execute(
                """
                INSERT INTO users (id, name, email, password_hash, role, is_active, created_at)
                VALUES (%s, %s, %s, %s, 'admin', true, %s)
                """,
                (user_id, ADMIN_NAME, ADMIN_EMAIL, hash_pw(ADMIN_PASSWORD), now()),
            )
            print(f"[OK] Usuario criado: {ADMIN_EMAIL}")
        else:
            user_id = str(row["id"])
            print(f"[INFO]   Usuario ja existe: {ADMIN_EMAIL}  (id={user_id[:8]}...)")

        # ── 2. Workspace ────────────────────────────────────────────────────
        cur.execute("SELECT id FROM workspaces WHERE slug = %s", (WORKSPACE_SLUG,))
        row = cur.fetchone()

        if row is None:
            ws_id = uid()
            cur.execute(
                """
                INSERT INTO workspaces
                  (id, name, slug, created_by, onboarding_completed, onboarding_step,
                   primary_color, timezone, locale, created_at, updated_at)
                VALUES (%s, %s, %s, %s, false, 0, '#89b4fa', 'America/Sao_Paulo', 'pt-BR', %s, %s)
                """,
                (ws_id, WORKSPACE_NAME, WORKSPACE_SLUG, user_id, now(), now()),
            )
            print(f"[OK]  Workspace criado: {WORKSPACE_NAME} (slug: {WORKSPACE_SLUG})")
        else:
            ws_id = str(row["id"])
            print(f"[INFO]   Workspace ja existe: {WORKSPACE_SLUG}  (id={ws_id[:8]}...)")

        # ── 3. Vocabulario padrao (idempotente) ─────────────────────────────
        cur.execute("SELECT id FROM org_vocabulary WHERE workspace_id = %s", (ws_id,))
        if cur.fetchone() is None:
            cur.execute(
                """
                INSERT INTO org_vocabulary
                  (id, workspace_id, term_project, term_task, term_sprint,
                   term_backlog, term_member, term_client)
                VALUES (%s, %s, 'Projeto', 'Tarefa', 'Sprint', 'Backlog', 'Membro', 'Cliente')
                """,
                (uid(), ws_id),
            )
            print("[OK]  Vocabulario padrao criado")
        else:
            print("[INFO]   Vocabulario ja existe")

        # ── 4. Membership admin ─────────────────────────────────────────────
        cur.execute(
            "SELECT id, role FROM workspace_members WHERE workspace_id = %s AND user_id = %s",
            (ws_id, user_id),
        )
        member = cur.fetchone()

        if member is None:
            cur.execute(
                """
                INSERT INTO workspace_members (id, workspace_id, user_id, role, joined_at)
                VALUES (%s, %s, %s, 'admin', %s)
                """,
                (uid(), ws_id, user_id, now()),
            )
            print("[OK]  Membro admin adicionado ao workspace")
        elif member["role"] != "admin":
            cur.execute(
                "UPDATE workspace_members SET role = 'admin' WHERE id = %s",
                (str(member["id"]),),
            )
            print("[OK]  Role promovido para admin")
        else:
            print("[INFO]   Ja e admin no workspace")

        conn.commit()

    except Exception as exc:
        conn.rollback()
        print(f"[ERRO]  Erro: {exc}")
        raise
    finally:
        cur.close()
        conn.close()

    print()
    print("-" * 50)
    print("  Credenciais de acesso:")
    print(f"  Email : {ADMIN_EMAIL}")
    print(f"  Senha : {ADMIN_PASSWORD}")
    print(f"  URL   : http://localhost:5180")
    print("-" * 50)


if __name__ == "__main__":
    main()
