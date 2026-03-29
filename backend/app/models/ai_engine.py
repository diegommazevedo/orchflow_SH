"""
models/ai_engine.py — Sprint 7.5: AI Token Manager

Tabelas:
  ai_engines           — motores de IA disponíveis
  ai_wallets           — carteira de créditos por workspace
  ai_usage_logs        — log de uso por chamada
  ai_wallet_transactions — créditos / débitos
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base


class AIEngine(Base):
    """Motor de IA disponível no sistema."""
    __tablename__ = "ai_engines"

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name      = Column(String(100), nullable=False)
    slug      = Column(String(50),  nullable=False, unique=True)
    provider  = Column(String(50),  nullable=False)   # groq | openai | anthropic
    model_id  = Column(String(200), nullable=False)

    cost_per_1k_input_tokens  = Column(Numeric(10, 6), nullable=False, default=0)
    cost_per_1k_output_tokens = Column(Numeric(10, 6), nullable=False, default=0)

    capabilities = Column(JSONB, nullable=False, default=list)  # ["chat","reasoning",...]
    is_active    = Column(Boolean, nullable=False, default=True)
    created_at   = Column(DateTime, default=datetime.utcnow)


class AIWallet(Base):
    """Carteira de créditos USD por workspace."""
    __tablename__ = "ai_wallets"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    balance_usd         = Column(Numeric(12, 4), nullable=False, default=0)
    total_spent_usd     = Column(Numeric(12, 4), nullable=False, default=0)
    alert_threshold_usd = Column(Numeric(12, 4), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AIUsageLog(Base):
    """Registro de uso por chamada ao motor."""
    __tablename__ = "ai_usage_logs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id = Column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id  = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    engine_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_engines.id"),
        nullable=False,
    )
    task_id    = Column(
        UUID(as_uuid=True),
        ForeignKey("tasks.id", ondelete="SET NULL"),
        nullable=True,
    )
    agent_name    = Column(String(100), nullable=True)
    input_tokens  = Column(Integer, nullable=False, default=0)
    output_tokens = Column(Integer, nullable=False, default=0)
    cost_usd      = Column(Numeric(10, 6), nullable=False, default=0)
    context       = Column(String(200), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow)


class AIWalletTransaction(Base):
    """Transação de crédito, débito ou reembolso na carteira."""
    __tablename__ = "ai_wallet_transactions"

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    wallet_id = Column(
        UUID(as_uuid=True),
        ForeignKey("ai_wallets.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount_usd   = Column(Numeric(12, 4), nullable=False)
    type         = Column(String(20), nullable=False)  # credit | debit | refund
    description  = Column(Text, nullable=True)
    reference_id = Column(String(200), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow)
