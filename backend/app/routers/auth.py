"""
routers/auth.py — Sprint 6B

Endpoints de autenticação:
  POST /api/auth/register  — cria conta + retorna token
  POST /api/auth/login     — autentica + retorna token
  GET  /api/auth/me        — retorna dados do usuário logado
  POST /api/auth/logout    — frontend descarta token (sem blacklist por ora)

Leis respeitadas:
  - Senha NUNCA retornada em nenhuma resposta
  - password_hash salvo com bcrypt — nunca plaintext
  - ConformityEngine em name e nickname antes de salvar
  - Email único validado com 409 (não 500)
  - last_login atualizado apenas no login
  - CORS mantido em main.py
"""
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from app.database import get_db
from app.models.user import User
from app.auth.security import hash_password, verify_password, create_token
from app.auth.dependencies import get_current_user
from app.agent.conformity import conform_title

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterBody(BaseModel):
    name:     str
    email:    str
    password: str
    nickname: Optional[str] = None


class LoginBody(BaseModel):
    email:    str
    password: str


class UserResponse(BaseModel):
    id:       str
    name:     str
    email:    str
    nickname: Optional[str]
    role:     str

    class Config:
        from_attributes = True


class AuthResponse(BaseModel):
    token: str
    user:  UserResponse


# ── POST /register ────────────────────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
def register(body: RegisterBody, db: Session = Depends(get_db)):
    """
    Cria nova conta.
    - Valida email único (409 se já existe)
    - Aplica ConformityEngine em name e nickname
    - Armazena bcrypt hash da senha — nunca plaintext
    - Retorna JWT + user info
    """
    # Email único
    if db.query(User).filter(User.email == body.email.lower().strip()).first():
        raise HTTPException(status_code=409, detail="Email já cadastrado")

    # ConformityEngine: name e nickname antes de salvar
    clean_name     = conform_title(body.name.strip())
    clean_nickname = conform_title(body.nickname.strip()) if body.nickname else None

    user = User(
        name          = clean_name,
        email         = body.email.lower().strip(),
        nickname      = clean_nickname,
        password_hash = hash_password(body.password),  # bcrypt — nunca plaintext
        is_active     = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(str(user.id), user.email)

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=str(user.id), name=user.name,
            email=user.email, nickname=user.nickname, role=user.role,
        ),
    )


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
def login(body: LoginBody, db: Session = Depends(get_db)):
    """
    Autentica usuário.
    - Verifica email + bcrypt hash
    - Atualiza last_login
    - Retorna JWT + user info (senha nunca na resposta)
    """
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()

    # Mensagem genérica — não revela se email existe
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
        )

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta desativada")

    user.last_login = datetime.utcnow()
    db.commit()

    token = create_token(str(user.id), user.email)

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=str(user.id), name=user.name,
            email=user.email, nickname=user.nickname, role=user.role,
        ),
    )


# ── GET /me ───────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def me(current: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna dados do usuário autenticado pelo token."""
    user = db.query(User).filter(User.id == uuid.UUID(current["user_id"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    return UserResponse(
        id=str(user.id), name=user.name,
        email=user.email, nickname=user.nickname, role=user.role,
    )


# ── POST /logout ──────────────────────────────────────────────────────────────

@router.post("/logout")
def logout():
    """
    Frontend descarta o token ao receber { ok: true }.
    Sem blacklist por ora (Sprint 7 implementa revogação).
    """
    return {"ok": True}
