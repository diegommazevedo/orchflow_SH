
import hashlib
import os
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.models.refresh_token import RefreshToken
from app.models.user import User

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def validate_password_strength(password: str) -> None:
    errors = []
    if len(password) < 8:
        errors.append("mínimo 8 caracteres")
    if not any(c.isupper() for c in password):
        errors.append("pelo menos 1 letra maiúscula")
    if not any(c.isdigit() for c in password):
        errors.append("pelo menos 1 número")
    if errors:
        raise HTTPException(
            status_code=422,
            detail=f"Senha fraca: {', '.join(errors)}",
        )


def create_user(email: str, password: str, name: str, db: Session) -> User:
    validate_password_strength(password)
    email_n = email.strip().lower()
    if db.query(User).filter(User.email == email_n).first():
        raise HTTPException(status_code=409, detail="Email já cadastrado")
    row = User(
        email=email_n,
        name=name.strip(),
        password_hash=pwd_ctx.hash(password),
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def authenticate_user(email: str, password: str, db: Session) -> Optional[User]:
    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if not user or not user.password_hash:
        return None
    if not pwd_ctx.verify(password, user.password_hash):
        return None
    if not user.is_active:
        return None
    user.last_login = datetime.utcnow()
    db.commit()
    return user


def create_access_token(user_id: str, workspace_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": user_id,
        "workspace": workspace_id,
        "exp": exp,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str, db: Session) -> str:
    raw = secrets.token_urlsafe(48)
    token_hash = _hash_refresh_token(raw)
    expires_at = datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    db.add(
        RefreshToken(
            user_id=uuid.UUID(user_id),
            token_hash=token_hash,
            expires_at=expires_at,
        )
    )
    db.commit()
    return raw


def refresh_access_token(refresh_token: str, workspace_id: str, db: Session) -> dict:
    """Rotate: validate current token, revoke it, issue new pair."""
    token_hash = _hash_refresh_token(refresh_token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not row or row.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Refresh token inválido")
    if row.revoked_at is not None:
        # Token reuse detected — possible theft; revoke all tokens for user
        raise HTTPException(status_code=401, detail="Sessão inválida. Faça login novamente.")
    # Revoke current token
    row.revoked_at = datetime.utcnow()
    # Generate new refresh token
    new_refresh = create_refresh_token(str(row.user_id), db)
    access = create_access_token(str(row.user_id), workspace_id)
    return {"access_token": access, "refresh_token": new_refresh}


def revoke_refresh_token(token: str, db: Session) -> None:
    token_hash = _hash_refresh_token(token)
    row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if row and row.revoked_at is None:
        row.revoked_at = datetime.utcnow()
        db.commit()


def get_or_create_oauth_user(
    provider: str,
    provider_id: str,
    email: Optional[str],
    name: str,
    avatar_url: Optional[str],
    db: Session,
) -> User:
    field = User.google_id if provider == "google" else User.github_id
    existing = db.query(User).filter(field == provider_id).first()
    if existing:
        if avatar_url:
            existing.avatar_url = avatar_url
            db.commit()
        return existing

    by_email = db.query(User).filter(User.email == (email or "").lower()).first() if email else None
    if by_email:
        if provider == "google":
            by_email.google_id = provider_id
        else:
            by_email.github_id = provider_id
        if avatar_url:
            by_email.avatar_url = avatar_url
        db.commit()
        db.refresh(by_email)
        return by_email

    row = User(
        email=(email or f"{provider_id}@{provider}.local").lower(),
        name=name or "Usuário OAuth",
        avatar_url=avatar_url,
        is_active=True,
        google_id=provider_id if provider == "google" else None,
        github_id=provider_id if provider == "github" else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        sub = payload.get("sub")
        workspace = payload.get("workspace")
        if not sub:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
        return {"user_id": sub, "workspace_id": workspace}
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token inválido ou expirado: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── One-time OAuth code store (in-memory, TTL 60s) ────────────────────────────
# Maps random code → {user_id, workspace_id, expires_at}
_oauth_codes: dict[str, dict] = {}
_OAUTH_CODE_TTL = 60  # seconds


def store_oauth_code(user_id: str, workspace_id: str) -> str:
    """Gera code efêmero para troca de token OAuth. Validade: 60 segundos."""
    code = secrets.token_urlsafe(32)
    _oauth_codes[code] = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "expires_at": time.time() + _OAUTH_CODE_TTL,
    }
    return code


def consume_oauth_code(code: str) -> dict | None:
    """Consome o code (remove do store). Retorna dados ou None se inválido/expirado."""
    data = _oauth_codes.pop(code, None)
    if not data:
        return None
    if time.time() > data["expires_at"]:
        return None
    return data
