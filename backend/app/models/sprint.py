"""
models/sprint.py

Sprint 5B + Sprint 7 — Sprint tipada (recorrente + encaixe).

Duas tabelas:
  sprints      — entidade de sprint com meta, datas, velocity e tipo
  sprint_tasks — join table (sprint_id, task_id) — PK composta

Sprint 7 additions:
  - type: standard | recorrente | encaixe
  - recurrence_unit / recurrence_interval para sprints recorrentes
  - auto_create: gera próximo sprint ao fechar
  - parent_sprint_id / sequence_number: série de sprints recorrentes
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Enum, Integer, ForeignKey, PrimaryKeyConstraint, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from app.database import Base


class SprintStatus(str, enum.Enum):
    planning  = "planning"
    active    = "active"
    completed = "completed"
    cancelled = "cancelled"


class SprintType(str, enum.Enum):
    standard   = "standard"
    recorrente = "recorrente"
    encaixe    = "encaixe"


class RecurrenceUnit(str, enum.Enum):
    daily   = "daily"
    weekly  = "weekly"
    monthly = "monthly"


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

    # Sprint 7: tipo + recorrência
    type                = Column(String(20), default="standard", nullable=False)
    recurrence_unit     = Column(String(20), nullable=True)
    recurrence_interval = Column(Integer, nullable=True)
    auto_create         = Column(Boolean, default=False, nullable=False)
    parent_sprint_id    = Column(UUID(as_uuid=True), ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True)
    sequence_number     = Column(Integer, default=1)

    children = relationship(
        "Sprint",
        backref=backref("parent", remote_side=[id]),
        lazy="select",
    )


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
