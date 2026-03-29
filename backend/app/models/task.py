from sqlalchemy import Column, String, DateTime, Enum, ForeignKey, Integer, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from app.database import Base
import uuid
import enum
from datetime import datetime


class EisenhowerQuadrant(str, enum.Enum):
    q1 = "q1"
    q2 = "q2"
    q3 = "q3"
    q4 = "q4"


class Task(Base):
    __tablename__ = "tasks"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title            = Column(String, nullable=False)
    description      = Column(String, nullable=True)
    # V2: slug da coluna Kanban (String livre, validado no router contra kanban_columns)
    status           = Column(String(100), nullable=False, default="backlog")
    quadrant         = Column(Enum(EisenhowerQuadrant), default=EisenhowerQuadrant.q2)
    time_spent_minutes = Column(Integer, default=0)
    due_date_iso     = Column(String, nullable=True)   # ISO 8601 ex: "2026-03-23"
    project_id       = Column(UUID(as_uuid=True), ForeignKey("projects.id"))
    assignee_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow)
    # Soft delete (V1.5) — task permanece no banco até purge explícito
    deleted_at       = Column(DateTime, nullable=True, index=True)
    deleted_by       = Column(String, nullable=True)
    # Sprint 6: Subtarefas — máx 1 nível de profundidade (validado no router)
    parent_task_id   = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True)
    # Sprint 7: Recorrência — task copiada em sprints recorrentes auto-criados
    is_recurring          = Column(Boolean, default=False, nullable=False)
    recurring_template_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)

    project  = relationship("Project", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assignee_id])
    subtasks = relationship(
        "Task",
        foreign_keys=[parent_task_id],
        backref=backref("parent", remote_side="Task.id"),
        cascade="all, delete-orphan",
        lazy="select",
    )
