"""
auth/dependencies.py — Sprint 6B

FastAPI dependencies para injeção de usuário autenticado.

get_current_user          → obrigatório (401 se sem token)
get_current_user_optional → opcional (None se sem token)

Leis respeitadas:
  - Retrocompatível: user_id='default' quando não autenticado
  - Nunca lança exceção no modo optional
  - Token decodificado apenas se presente e válido
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials

from app.auth.security import decode_token

# OAuth2 scheme aponta para /api/auth/login
oauth2_scheme          = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
# HTTPBearer para leitura explícita do header (auto_error=False → não lança 403)
_bearer                = HTTPBearer(auto_error=False)


# ── Obrigatório ───────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Extrai e valida Bearer token.
    Lança 401 se ausente ou inválido.
    Retorna { user_id: str, email: str }.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação necessário",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


# ── Opcional ─────────────────────────────────────────────────────────────────

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[dict]:
    """
    Extrai Bearer token se presente.
    Retorna { user_id, email } se válido.
    Retorna None se ausente ou inválido — nunca lança exceção.
    Permite retrocompatibilidade com user_id='default'.
    """
    if not credentials:
        return None
    try:
        return decode_token(credentials.credentials)
    except HTTPException:
        return None
