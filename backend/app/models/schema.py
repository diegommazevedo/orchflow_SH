"""V2 — Campos customizados por projeto/vertical."""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.database import Base


class FieldType(str, enum.Enum):
    text = "text"
    textarea = "textarea"
    number = "number"
    date = "date"
    select = "select"
    multiselect = "multiselect"
    user = "user"
    boolean = "boolean"
    currency = "currency"
    url = "url"


class CustomField(Base):
    __tablename__ = "custom_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    entity_type = Column(String(32), nullable=False)  # task | project | sprint
    name = Column(String(128), nullable=False)
    label = Column(String(256), nullable=False)
    field_type = Column(String(32), nullable=False)
    required = Column(Boolean, default=False)
    options = Column(JSONB, default=list)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    values = relationship("CustomFieldValue", back_populates="field", cascade="all, delete-orphan")


class CustomFieldValue(Base):
    __tablename__ = "custom_field_values"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_id = Column(UUID(as_uuid=True), ForeignKey("custom_fields.id"), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    entity_type = Column(String(32), nullable=False)
    value = Column(JSONB, nullable=False, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    conformed_at = Column(DateTime, nullable=True)

    field = relationship("CustomField", back_populates="values")
