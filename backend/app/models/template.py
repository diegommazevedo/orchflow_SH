"""V2 — Templates de vertical (metadados + JSONB)."""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class VerticalTemplate(Base):
    __tablename__ = "vertical_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    slug = Column(String(64), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    custom_fields = Column(JSONB, default=list)
    kanban_columns = Column(JSONB, default=list)
    agent_configs = Column(JSONB, default=dict)
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
