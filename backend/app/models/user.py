"""Modelo de usuário com suporte local + OAuth (Sprint 5)."""
from sqlalchemy import Column, String, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
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
    password_hash = Column(String, nullable=True)    # bcrypt hash — nunca plaintext
    google_id     = Column(String, unique=True, nullable=True)
    github_id     = Column(String, unique=True, nullable=True)
    avatar_url    = Column(String, nullable=True)
    is_active     = Column(Boolean, default=True)
    last_login    = Column(DateTime, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)

    workspace_members = relationship("WorkspaceMember", foreign_keys="WorkspaceMember.user_id")
