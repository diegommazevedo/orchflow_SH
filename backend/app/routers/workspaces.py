"""
routers/workspaces.py — Sprint 8: Organização como entidade

Endpoints:
  POST   /workspaces                          → criar workspace
  GET    /workspaces/mine                     → listar meus workspaces (completo)
  GET    /workspaces/{id}                     → workspace completo + vocabulary
  PATCH  /workspaces/{id}                     → atualizar identidade (Admin)
  GET    /workspaces/{id}/vocabulary          → vocabulário customizado
  PATCH  /workspaces/{id}/vocabulary          → atualizar termos (Admin)
  GET    /workspaces/{id}/onboarding/steps    → definição dos steps
  POST   /workspaces/{id}/onboarding/advance  → avançar step
  POST   /workspaces/{id}/onboarding/complete → marcar concluído
  POST   /workspaces/{id}/onboarding/reset    → refazer (Admin)
  GET    /workspaces/{id}/members
  POST   /workspaces/{id}/invite
  POST   /workspaces/{id}/accept-invite
  DELETE /workspaces/{id}/members/{user_id}
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.workspace import OrgVocabulary, Workspace, WorkspaceMember
from app.schemas.workspace import OrgVocabularyUpdate, WorkspaceUpdate
from app.services.onboarding_service import (
    advance_onboarding,
    complete_onboarding,
    get_mission_suggestion,
    get_onboarding_steps,
    reset_onboarding,
)
from app.services.workspace_service import (
    accept_invite,
    create_workspace,
    invite_member,
    list_members,
    remove_member,
)

router = APIRouter()


# ── Request bodies ─────────────────────────────────────────────────────────────

class WorkspaceCreateBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class InviteBody(BaseModel):
    email: EmailStr
    role: str = "member"


class AcceptInviteBody(BaseModel):
    token: str


class OnboardingAdvanceBody(BaseModel):
    step: int
    data: dict[str, Any] = {}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _assert_workspace_admin(workspace_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> None:
    """Verifica que user_id é admin do workspace_id específico do path."""
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
        WorkspaceMember.role == "admin",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Ação permitida apenas para admin do workspace")


def _ws_out(ws: Workspace) -> dict:
    vocab = ws.vocabulary
    vocab_dict = None
    if vocab:
        vocab_dict = {
            "term_project": vocab.term_project,
            "term_task":    vocab.term_task,
            "term_sprint":  vocab.term_sprint,
            "term_backlog": vocab.term_backlog,
            "term_member":  vocab.term_member,
            "term_client":  vocab.term_client,
        }
    return {
        "id":                   str(ws.id),
        "name":                 ws.name,
        "slug":                 ws.slug,
        "legal_name":           ws.legal_name,
        "vertical":             ws.vertical,
        "mission":              ws.mission,
        "logo_url":             ws.logo_url,
        "primary_color":        ws.primary_color or "#89b4fa",
        "timezone":             ws.timezone or "America/Sao_Paulo",
        "locale":               ws.locale or "pt-BR",
        "industry":             ws.industry,
        "size_range":           ws.size_range,
        "onboarding_completed": bool(ws.onboarding_completed),
        "onboarding_step":      ws.onboarding_step or 0,
        "vocabulary":           vocab_dict,
    }


def _get_workspace_or_404(workspace_id: uuid.UUID, db: Session) -> Workspace:
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado.")
    return ws


def _assert_membership(workspace_id: uuid.UUID, user_id: uuid.UUID, db: Session) -> WorkspaceMember:
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Sem acesso a este workspace.")
    return member


# ── Workspace CRUD ─────────────────────────────────────────────────────────────

@router.post("/workspaces")
def create_workspace_endpoint(
    body: WorkspaceCreateBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ws = create_workspace(body.name, str(current_user.id), db)
    return _ws_out(ws)


@router.get("/workspaces/mine")
def mine(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Workspace)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
        .filter(WorkspaceMember.user_id == current_user.id)
        .all()
    )
    return [_ws_out(ws) for ws in rows]


@router.get("/workspaces/{workspace_id}")
def get_workspace(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna workspace completo com vocabulary. Requer membership."""
    ws = _get_workspace_or_404(workspace_id, db)
    _assert_membership(workspace_id, current_user.id, db)
    return _ws_out(ws)


@router.patch("/workspaces/{workspace_id}")
def update_workspace(
    workspace_id: uuid.UUID,
    body: WorkspaceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atualiza identidade organizacional. Admin only."""
    _assert_workspace_admin(workspace_id, current_user.id, db)
    ws = _get_workspace_or_404(workspace_id, db)
    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(ws, field, value)
    db.commit()
    db.refresh(ws)
    return _ws_out(ws)


# ── Vocabulary ─────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/vocabulary")
def get_vocabulary(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna vocabulário customizado do workspace."""
    ws = _get_workspace_or_404(workspace_id, db)
    _assert_membership(workspace_id, current_user.id, db)
    vocab = ws.vocabulary
    if not vocab:
        return {
            "term_project": "Projeto", "term_task": "Tarefa",
            "term_sprint":  "Sprint",  "term_backlog": "Backlog",
            "term_member":  "Membro",  "term_client": "Cliente",
        }
    return {
        "term_project": vocab.term_project,
        "term_task":    vocab.term_task,
        "term_sprint":  vocab.term_sprint,
        "term_backlog": vocab.term_backlog,
        "term_member":  vocab.term_member,
        "term_client":  vocab.term_client,
    }


@router.patch("/workspaces/{workspace_id}/vocabulary")
def update_vocabulary(
    workspace_id: uuid.UUID,
    body: OrgVocabularyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Atualiza vocabulário customizado. Admin only."""
    _assert_workspace_admin(workspace_id, current_user.id, db)
    ws = _get_workspace_or_404(workspace_id, db)
    vocab = ws.vocabulary
    if not vocab:
        vocab = OrgVocabulary(workspace_id=ws.id)
        db.add(vocab)
        db.flush()

    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        if value:
            setattr(vocab, field, value)

    db.commit()
    db.refresh(vocab)
    return {
        "term_project": vocab.term_project,
        "term_task":    vocab.term_task,
        "term_sprint":  vocab.term_sprint,
        "term_backlog": vocab.term_backlog,
        "term_member":  vocab.term_member,
        "term_client":  vocab.term_client,
    }


# ── Onboarding ─────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/onboarding/steps")
def onboarding_steps_endpoint(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Retorna definição dos steps + sugestão de missão por vertical."""
    ws = _get_workspace_or_404(workspace_id, db)
    _assert_membership(workspace_id, current_user.id, db)
    suggestion = get_mission_suggestion(ws.vertical or "other")
    return {
        "steps": get_onboarding_steps(),
        "current_step": ws.onboarding_step or 0,
        "mission_suggestion": suggestion,
    }


@router.post("/workspaces/{workspace_id}/onboarding/advance")
def onboarding_advance(
    workspace_id: uuid.UUID,
    body: OnboardingAdvanceBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Avança um step do onboarding."""
    ws = _get_workspace_or_404(workspace_id, db)
    _assert_membership(workspace_id, current_user.id, db)
    if body.step < 1 or body.step > 5:
        raise HTTPException(status_code=422, detail="Step deve ser entre 1 e 5.")
    ws = advance_onboarding(ws, body.step, body.data, str(current_user.id), db)
    return _ws_out(ws)


@router.post("/workspaces/{workspace_id}/onboarding/complete")
def onboarding_complete(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marca onboarding como concluído."""
    ws = _get_workspace_or_404(workspace_id, db)
    _assert_membership(workspace_id, current_user.id, db)
    ws = complete_onboarding(ws, str(current_user.id), db)
    return _ws_out(ws)


@router.post("/workspaces/{workspace_id}/onboarding/reset")
def onboarding_reset(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reseta onboarding para refazer. Admin only."""
    _assert_workspace_admin(workspace_id, current_user.id, db)
    ws = _get_workspace_or_404(workspace_id, db)
    ws = reset_onboarding(ws, str(current_user.id), db)
    return _ws_out(ws)


# ── Members ────────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/members")
def members(
    workspace_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_workspace_admin(workspace_id, current_user.id, db)
    rows = list_members(str(workspace_id), db)
    return [
        {"workspace_id": str(x.workspace_id), "user_id": str(x.user_id), "role": x.role, "joined_at": x.joined_at}
        for x in rows
    ]


@router.post("/workspaces/{workspace_id}/invite")
def invite(
    workspace_id: uuid.UUID,
    body: InviteBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_workspace_admin(workspace_id, current_user.id, db)
    inv, raw_token = invite_member(str(workspace_id), str(body.email), body.role, str(current_user.id), db)
    return {"id": str(inv.id), "token": raw_token}


@router.post("/workspaces/{workspace_id}/accept-invite")
def accept(
    workspace_id: uuid.UUID,
    body: AcceptInviteBody,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = accept_invite(body.token, str(current_user.id), db)
    return {"workspace_id": str(member.workspace_id), "user_id": str(member.user_id), "role": member.role}


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
def remove(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _assert_workspace_admin(workspace_id, current_user.id, db)
    remove_member(str(workspace_id), str(user_id), db)
    return {"ok": True}
