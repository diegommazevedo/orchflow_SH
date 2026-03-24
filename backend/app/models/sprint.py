"""
models/sprint.py

Sprint 5B — Sprint como entidade real com backlog próprio.

Duas tabelas:
  sprints      — entidade de sprint com meta, datas e velocity
  sprint_tasks — join table (sprint_id, task_id) — PK composta

Leis respeitadas:
  - name e goal passam pelo ConformityEngine no router antes de salvar
  - start_date e end_date armazenados como ISO 8601 (string) — igual ao campo due_date_iso das tasks
  - velocity calculado pelo backend (tasks done no sprint) — nunca pelo frontend
  - ActivityLog gerado no backend para sprint_started e sprint_completed
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum, Integer, ForeignKey, PrimaryKeyConstraint, Text
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SprintStatus(str, enum.Enum):
    planning  = "planning"
    active    = "active"
    completed = "completed"
    cancelled = "cancelled"


class Sprint(Base):
    __tablename__ = "sprints"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    name       = Column(String, nullable=False)       # "Sprint 1", "MVP Alpha"
    goal       = Column(Text, nullable=True)           # meta do sprint
    status     = Column(Enum(SprintStatus), default=SprintStatus.planning, nullable=False)
    start_date = Column(String, nullable=True)         # ISO 8601 "2026-03-24"
    end_date   = Column(String, nullable=True)         # ISO 8601
    velocity   = Column(Integer, default=0)            # tasks concluídas ao completar
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SprintTask(Base):
    """
    Tabela de junção sprint ↔ task.
    PK composta (sprint_id, task_id) — uma task pode estar em apenas um sprint ativo.
    """
    __tablename__ = "sprint_tasks"
    __table_args__ = (
        PrimaryKeyConstraint("sprint_id", "task_id"),
    )

    sprint_id = Column(UUID(as_uuid=True),
                       ForeignKey("sprints.id", ondelete="CASCADE"), nullable=False)
    task_id   = Column(UUID(as_uuid=True),
                       ForeignKey("tasks.id",   ondelete="CASCADE"), nullable=False)
    added_at  = Column(DateTime, default=datetime.utcnow)
