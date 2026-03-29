"""V2 — Colunas Kanban por projeto."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class KanbanColumn(Base):
    __tablename__ = "kanban_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    slug = Column(String(64), nullable=False)
    color = Column(String(16), nullable=False, default="#4a4a6a")
    order = Column(Integer, nullable=False, default=0)
    is_default = Column(Boolean, default=False)
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="kanban_columns")
