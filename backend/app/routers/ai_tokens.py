"""
routers/ai_tokens.py — Sprint 7.5: AI Token Manager

Endpoints:
  GET  /api/ai/wallet          → saldo, total gasto, threshold
  GET  /api/ai/usage           → histórico paginado + agregações
  GET  /api/ai/engines         → motores ativos com capabilities e preços
  POST /api/ai/wallet/credit   → adicionar créditos (admin only)
  PATCH /api/ai/wallet/alert   → definir threshold de alerta

Leis:
  - Admin only: POST /credit
  - workspace_id filtrado em todos os endpoints (Lei 15)
  - API keys nunca expostas ao frontend (Lei 10)
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_current_workspace, require_admin
from app.database import get_db
from app.models.ai_engine import AIEngine, AIUsageLog, AIWallet, AIWalletTransaction
from app.models.user import User
from app.models.workspace import Workspace
from app.services.ai_router import get_or_create_wallet

router = APIRouter()


# ── Schemas de resposta ───────────────────────────────────────────────────────


class WalletResponse(BaseModel):
    id: str
    workspace_id: str
    balance_usd: float
    total_spent_usd: float
    alert_threshold_usd: Optional[float] = None

    class Config:
        from_attributes = True


class EngineResponse(BaseModel):
    id: str
    name: str
    slug: str
    provider: str
    model_id: str
    cost_per_1k_input_tokens: float
    cost_per_1k_output_tokens: float
    capabilities: list
    is_active: bool

    class Config:
        from_attributes = True


class UsageLogItem(BaseModel):
    id: str
    engine_slug: str
    engine_name: str
    agent_name: Optional[str]
    task_id: Optional[str]
    input_tokens: int
    output_tokens: int
    cost_usd: float
    context: Optional[str]
    created_at: str


class ByEngineItem(BaseModel):
    engine: str
    cost: float
    calls: int


class ByAgentItem(BaseModel):
    agent: str
    cost: float
    calls: int


class ByDayItem(BaseModel):
    date: str
    cost: float
    calls: int


class UsageSummaryResponse(BaseModel):
    total_cost_usd: float
    total_calls: int
    by_engine: List[ByEngineItem]
    by_agent: List[ByAgentItem]
    by_day: List[ByDayItem]
    logs: List[UsageLogItem]


class CreditBody(BaseModel):
    amount_usd: float
    description: str = ""


class AlertBody(BaseModel):
    threshold_usd: Optional[float] = None


# ── Helpers ───────────────────────────────────────────────────────────────────


def _wallet_response(wallet: AIWallet) -> WalletResponse:
    return WalletResponse(
        id=str(wallet.id),
        workspace_id=str(wallet.workspace_id),
        balance_usd=float(wallet.balance_usd or 0),
        total_spent_usd=float(wallet.total_spent_usd or 0),
        alert_threshold_usd=float(wallet.alert_threshold_usd) if wallet.alert_threshold_usd is not None else None,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/ai/wallet", response_model=WalletResponse)
def get_wallet(
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Retorna saldo atual, total gasto e threshold de alerta."""
    wallet = get_or_create_wallet(str(current_workspace.id), db)
    return _wallet_response(wallet)


@router.get("/ai/engines", response_model=List[EngineResponse])
def list_engines(
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Lista motores ativos com capabilities e preços."""
    engines = db.query(AIEngine).filter(AIEngine.is_active == True).all()  # noqa: E712
    return [
        EngineResponse(
            id=str(e.id),
            name=e.name,
            slug=e.slug,
            provider=e.provider,
            model_id=e.model_id,
            cost_per_1k_input_tokens=float(e.cost_per_1k_input_tokens),
            cost_per_1k_output_tokens=float(e.cost_per_1k_output_tokens),
            capabilities=e.capabilities or [],
            is_active=e.is_active,
        )
        for e in engines
    ]


@router.get("/ai/usage", response_model=UsageSummaryResponse)
def get_usage(
    days: int = Query(default=30, ge=1, le=365),
    agent: Optional[str] = Query(default=None),
    engine: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Histórico de uso paginado com agregações por dia/motor/agente."""
    since = datetime.utcnow() - timedelta(days=days)

    q = (
        db.query(AIUsageLog)
        .filter(
            AIUsageLog.workspace_id == current_workspace.id,
            AIUsageLog.created_at >= since,
        )
    )
    if agent:
        q = q.filter(AIUsageLog.agent_name == agent)

    logs_raw = q.order_by(AIUsageLog.created_at.desc()).limit(500).all()

    # Filtra por engine slug se especificado
    engine_map: dict[str, AIEngine] = {}
    all_engines = db.query(AIEngine).all()
    for e in all_engines:
        engine_map[str(e.id)] = e

    if engine:
        logs_raw = [l for l in logs_raw if engine_map.get(str(l.engine_id), AIEngine()).slug == engine]

    # Agrega
    by_engine: dict[str, dict] = {}
    by_agent:  dict[str, dict] = {}
    by_day:    dict[str, dict] = {}
    total_cost = Decimal("0")

    log_items: list[UsageLogItem] = []
    for row in logs_raw:
        eng = engine_map.get(str(row.engine_id))
        eng_name  = eng.name if eng else "—"
        eng_slug  = eng.slug if eng else "—"
        cost_val  = float(row.cost_usd or 0)
        total_cost += Decimal(str(cost_val))

        # by_engine
        if eng_slug not in by_engine:
            by_engine[eng_slug] = {"engine": eng_slug, "cost": 0.0, "calls": 0}
        by_engine[eng_slug]["cost"]  += cost_val
        by_engine[eng_slug]["calls"] += 1

        # by_agent
        ag = row.agent_name or "—"
        if ag not in by_agent:
            by_agent[ag] = {"agent": ag, "cost": 0.0, "calls": 0}
        by_agent[ag]["cost"]  += cost_val
        by_agent[ag]["calls"] += 1

        # by_day
        day_key = row.created_at.strftime("%Y-%m-%d") if row.created_at else "?"
        if day_key not in by_day:
            by_day[day_key] = {"date": day_key, "cost": 0.0, "calls": 0}
        by_day[day_key]["cost"]  += cost_val
        by_day[day_key]["calls"] += 1

        log_items.append(UsageLogItem(
            id=str(row.id),
            engine_slug=eng_slug,
            engine_name=eng_name,
            agent_name=row.agent_name,
            task_id=str(row.task_id) if row.task_id else None,
            input_tokens=row.input_tokens or 0,
            output_tokens=row.output_tokens or 0,
            cost_usd=cost_val,
            context=row.context,
            created_at=row.created_at.isoformat() if row.created_at else "",
        ))

    return UsageSummaryResponse(
        total_cost_usd=float(total_cost),
        total_calls=len(logs_raw),
        by_engine=sorted(by_engine.values(), key=lambda x: x["cost"], reverse=True),
        by_agent=sorted(by_agent.values(), key=lambda x: x["cost"], reverse=True),
        by_day=sorted(by_day.values(), key=lambda x: x["date"]),
        logs=log_items,
    )


@router.post("/ai/wallet/credit", response_model=WalletResponse)
def credit_wallet(
    body: CreditBody,
    db: Session = Depends(get_db),
    _admin: None = Depends(require_admin),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Adiciona créditos à carteira. Admin only."""
    if body.amount_usd <= 0:
        raise HTTPException(status_code=422, detail="Valor deve ser positivo.")

    wallet = get_or_create_wallet(str(current_workspace.id), db)
    amount = Decimal(str(body.amount_usd))

    wallet.balance_usd = (wallet.balance_usd or Decimal("0")) + amount

    tx = AIWalletTransaction(
        wallet_id=wallet.id,
        amount_usd=amount,
        type="credit",
        description=body.description or "Crédito manual",
    )
    db.add(tx)
    db.commit()
    db.refresh(wallet)
    return _wallet_response(wallet)


@router.patch("/ai/wallet/alert", response_model=WalletResponse)
def set_wallet_alert(
    body: AlertBody,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Define threshold de alerta de saldo."""
    wallet = get_or_create_wallet(str(current_workspace.id), db)
    wallet.alert_threshold_usd = Decimal(str(body.threshold_usd)) if body.threshold_usd is not None else None
    db.commit()
    db.refresh(wallet)
    return _wallet_response(wallet)
