"""
models/user.py — Sprint 6B: adicionados campos de autenticação.

Leis respeitadas:
  - password_hash armazena apenas o hash bcrypt — nunca plaintext
  - is_active permite desativar contas sem deletar dados
  - last_login atualizado apenas no login bem-sucedido
"""
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base
import uuid
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name          = Column(String, nullable=False)
    email         = Column(String, unique=True, nullable=False, index=True)
    nickname      = Column(String, nullable=True)    # apelido para o agente resolver
    role          = Column(String, default="member") # admin | member | viewer
    # ── Sprint 6B: auth ──────────────────────────────────────────────────────
    password_hash = Column(String, nullable=True)    # bcrypt hash — nunca plaintext
    is_active     = Column(Boolean, default=True)
    last_login    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)
