from sqlalchemy import Column, String, DateTime, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base
import uuid
import enum
from datetime import datetime


class ProjectStatus(str, enum.Enum):
    active = "active"
    paused = "paused"
    done = "done"
    archived = "archived"


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.active)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    tasks           = relationship("Task", back_populates="project")
    kanban_columns  = relationship(
        "KanbanColumn",
        back_populates="project",
        order_by="KanbanColumn.order",
    )
    workspace = relationship("Workspace", back_populates="projects")
