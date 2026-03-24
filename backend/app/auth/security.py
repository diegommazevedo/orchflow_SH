"""
auth/security.py — Sprint 6B

Utilitários de autenticação:
  - hash_password / verify_password (bcrypt via passlib)
  - create_token / decode_token (JWT via python-jose)

Leis respeitadas:
  - Senha nunca trafega após o POST inicial
  - SECRET_KEY lida de variável de ambiente
  - Token expira em 7 dias (ajustável via env TOKEN_EXPIRE_MINUTES)
  - decode_token lança HTTPException 401 — nunca retorna dados inválidos
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import HTTPException, status

# ── Configuração ──────────────────────────────────────────────────────────────
SECRET_KEY  = os.getenv("SECRET_KEY", "orchflow-dev-secret-key-CHANGE-IN-PRODUCTION")
ALGORITHM   = "HS256"
TOKEN_EXPIRE_MINUTES = int(os.getenv("TOKEN_EXPIRE_MINUTES", str(60 * 24 * 7)))  # 7 dias

_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Senha ─────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Retorna hash bcrypt da senha. Nunca armazena plaintext."""
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica se plaintext corresponde ao hash bcrypt."""
    return _pwd_ctx.verify(plain, hashed)


# ── JWT ───────────────────────────────────────────────────────────────────────

def create_token(user_id: str, email: str) -> str:
    """
    Cria JWT com sub=user_id, email e exp.
    Token válido por TOKEN_EXPIRE_MINUTES minutos.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub":   user_id,
        "email": email,
        "exp":   expire,
        "iat":   datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """
    Decodifica JWT e retorna payload.
    Lança HTTPException 401 se inválido ou expirado.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: Optional[str] = payload.get("sub")
        email:   Optional[str] = payload.get("email")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token inválido — sub ausente",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return {"user_id": user_id, "email": email}
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido ou expirado: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
