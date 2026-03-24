"""
models/memory.py

Tabelas de memória semântica por usuário.
Persiste no PostgreSQL (JSONB para embeddings leves).
"""

from sqlalchemy import Column, String, DateTime, Float, Integer, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
from datetime import datetime


class UserSemanticProfile(Base):
    """
    Perfil semântico permanente por usuário.
    Armazena preferências, threshold, dicionário pessoal e trust level.
    """
    __tablename__ = "user_semantic_profiles"

    id                   = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id              = Column(String, unique=True, nullable=False, index=True)
    confidence_threshold = Column(Float, default=0.85)
    trust_level          = Column(Integer, default=0)
    personal_dict        = Column(JSONB, default=dict)
    auto_execute_count   = Column(JSONB, default=dict)
    is_public            = Column(Boolean, default=False)
    created_at           = Column(DateTime, default=datetime.utcnow)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    memories = relationship("SemanticMemory", back_populates="profile",
                            cascade="all, delete-orphan")


class SemanticMemory(Base):
    """
    Memória individual de intenção.
    Cada entrada = um comando confirmado pelo usuário + embedding vetorial leve.
    """
    __tablename__ = "semantic_memories"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    profile_id      = Column(
        UUID(as_uuid=True),
        ForeignKey("user_semantic_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    raw_input       = Column(Text, nullable=False)
    normalized      = Column(Text, nullable=False)
    action          = Column(String, nullable=False)
    params_json     = Column(JSONB, default=dict)
    confidence      = Column(Float, default=1.0)
    hit_count       = Column(Integer, default=1)
    embedding       = Column(JSONB, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
    last_used_at    = Column(DateTime, default=datetime.utcnow)

    profile = relationship("UserSemanticProfile", back_populates="memories")
