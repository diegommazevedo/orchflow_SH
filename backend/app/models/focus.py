"""
models/focus.py

Sprint 5C — Hiperfoco, carga horária real e log de produtividade.

Tabelas:
  focus_sessions           : cada sessão de foco (Pomodoro ou livre)
  productivity_snapshots   : snapshot diário por usuário

Leis respeitadas:
  - FocusSession é a fonte da verdade — started_at/ended_at no banco
  - O timer no frontend é apenas display
  - notes passa pelo ConformityEngine no router antes de salvar
  - ProductivitySnapshot gerado/atualizado pelo backend ao encerrar sessão
  - ActivityLog gerado no router ao encerrar sessão
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum, Integer, Float, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class FocusMood(str, enum.Enum):
    blocked = "blocked"
    ok      = "ok"
    flow    = "flow"


class FocusSession(Base):
    __tablename__ = "focus_sessions"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id          = Column(String, nullable=False, default="default", index=True)
    task_id          = Column(UUID(as_uuid=True),
                              ForeignKey("tasks.id", ondelete="SET NULL"),
                              nullable=True)
    sprint_id        = Column(UUID(as_uuid=True),
                              ForeignKey("sprints.id", ondelete="SET NULL"),
                              nullable=True)
    started_at       = Column(DateTime, nullable=False, default=datetime.utcnow)
    ended_at         = Column(DateTime, nullable=True)
    duration_minutes = Column(Integer, nullable=True)  # calculado pelo backend no /end
    mood             = Column(Enum(FocusMood), nullable=True)
    notes            = Column(Text, nullable=True)     # passa por ConformityEngine
    is_pomodoro      = Column(Boolean, default=False)
    pomodoro_minutes = Column(Integer, default=25)
    created_at       = Column(DateTime, default=datetime.utcnow)


class ProductivitySnapshot(Base):
    """
    Snapshot diário de produtividade por usuário.
    Criado/atualizado pelo backend ao encerrar cada sessão de foco.
    Nunca gerado pelo frontend.
    """
    __tablename__ = "productivity_snapshots"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(String, nullable=False, default="default", index=True)
    date            = Column(String, nullable=False)    # ISO date "2026-03-24"
    focus_minutes   = Column(Integer, default=0)        # total de minutos focados no dia
    tasks_completed = Column(Integer, default=0)        # tasks marcadas done após sessão
    tasks_moved     = Column(Integer, default=0)        # tasks que mudaram de status
    mood_avg        = Column(Float, nullable=True)      # 0.0=blocked · 1.0=ok · 2.0=flow
    velocity_delta  = Column(Float, nullable=True)      # variação de velocity vs dia anterior
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow)
