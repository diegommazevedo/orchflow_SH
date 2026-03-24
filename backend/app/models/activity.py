"""
models/activity.py

Sprint 5A — Comentários e log de atividade.

Duas tabelas:
  - comments      : comentários por task (soft-deletable)
  - activity_logs : auditoria imutável de ações

Leis respeitadas:
  - body do comentário passa pelo ConformityEngine no router (conform_description)
  - ActivityLog nunca é editado — append-only
  - Menções extraídas do body no router, não pelo modelo
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base
import uuid
from datetime import datetime


class Comment(Base):
    __tablename__ = "comments"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id    = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id    = Column(String, nullable=False, default="default")
    body       = Column(Text, nullable=False)
    mentions   = Column(JSONB, default=list)    # ["zé", "maria"]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True)    # soft-delete


class ActivityLog(Base):
    """
    Log imutável de atividade (append-only).
    Nunca fazer UPDATE ou DELETE nesta tabela.

    action values:
      "created" | "moved" | "updated" | "commented" | "deleted" | "assigned" | "due_changed"
    """
    __tablename__ = "activity_logs"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String, nullable=False)     # "task" | "project"
    entity_id   = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id     = Column(String, nullable=False, default="default")
    action      = Column(String, nullable=False)
    # 'metadata' é reservado pelo SQLAlchemy — coluna DB chama-se 'metadata'
    # mas o atributo Python é 'extra_data' para evitar conflito
    extra_data  = Column("metadata", JSONB, default=dict)
    # ex: {"from": "backlog", "to": "in_progress"}
    # ex: {"comment_id": "uuid", "preview": "primeiros 80 chars..."}
    # ex: {"title": "tarefa removida"}
    created_at  = Column(DateTime, default=datetime.utcnow)
