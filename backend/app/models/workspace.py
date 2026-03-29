from __future__ import annotations

import enum
import uuid
from datetime import datetime, timedelta

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class WorkspaceRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class Workspace(Base):
    __tablename__ = "workspaces"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name       = Column(String(200), nullable=False)
    slug       = Column(String(100), nullable=False, unique=True, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # ── Sprint 8: identidade organizacional ──────────────────────────────────
    legal_name           = Column(String(200), nullable=True)
    vertical             = Column(String(100), nullable=True)
    mission              = Column(Text,        nullable=True)
    logo_url             = Column(Text,        nullable=True)
    primary_color        = Column(String(7),   nullable=True, default="#89b4fa")
    timezone             = Column(String(50),  nullable=True, default="America/Sao_Paulo")
    locale               = Column(String(10),  nullable=True, default="pt-BR")
    industry             = Column(String(100), nullable=True)
    size_range           = Column(String(50),  nullable=True)
    onboarding_completed = Column(Boolean, nullable=False, default=False)
    onboarding_step      = Column(Integer, nullable=False, default=0)

    members    = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    invites    = relationship("WorkspaceInvite",  back_populates="workspace", cascade="all, delete-orphan")
    projects   = relationship("Project", back_populates="workspace")
    vocabulary = relationship(
        "OrgVocabulary",
        uselist=False,
        back_populates="workspace",
        cascade="all, delete-orphan",
    )


class OrgVocabulary(Base):
    """Vocabulário customizado da organização (termos renomeáveis)."""
    __tablename__ = "org_vocabulary"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    term_project = Column(String(50), nullable=False, default="Projeto")
    term_task    = Column(String(50), nullable=False, default="Tarefa")
    term_sprint  = Column(String(50), nullable=False, default="Sprint")
    term_backlog = Column(String(50), nullable=False, default="Backlog")
    term_member  = Column(String(50), nullable=False, default="Membro")
    term_client  = Column(String(50), nullable=False, default="Cliente")

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="vocabulary")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id",      ondelete="CASCADE"), nullable=False, index=True)
    role         = Column(String(20), nullable=False, default=WorkspaceRole.member.value)
    invited_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    joined_at    = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="members")
    user      = relationship("User", foreign_keys=[user_id])


class WorkspaceInvite(Base):
    __tablename__ = "workspace_invites"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    email        = Column(String(200), nullable=False, index=True)
    role         = Column(String(20),  nullable=False, default=WorkspaceRole.member.value)
    token        = Column(String(200), nullable=False, unique=True, index=True)
    invited_by   = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    expires_at   = Column(DateTime, default=lambda: datetime.utcnow() + timedelta(days=7))
    accepted_at  = Column(DateTime, nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="invites")
