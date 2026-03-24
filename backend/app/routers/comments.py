"""
routers/comments.py

Sprint 5A — Comentários por task e feed de atividade.

Endpoints:
  GET  /api/comments/task/{task_id}          — lista comentários
  POST /api/comments/task/{task_id}          — cria comentário
  DELETE /api/comments/{comment_id}          — soft delete

  GET  /api/activity/entity/{type}/{entity_id} — log de atividade

Leis respeitadas:
  - body do comentário → conform_description antes de salvar (Lei da Conformidade Universal)
  - Menções extraídas automaticamente do body com regex @(word)
  - ActivityLog gerado pelo backend — nunca pelo frontend
  - Zero wizard para comentários (risco LOW, reversível via soft-delete)
  - CORS mantido via main.py
"""
import re
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.activity import ActivityLog, Comment
from app.agent.conformity import conform_description
from app.auth.dependencies import get_current_user_optional

# ── Dois routers: um para /api/comments, outro para /api/activity ─────────────
comments_router = APIRouter()
activity_router = APIRouter()


# ── helpers ───────────────────────────────────────────────────────────────────

def _extract_mentions(body: str) -> list[str]:
    """Extrai @menções do corpo do comentário."""
    return list(dict.fromkeys(re.findall(r'@(\w+)', body)))  # unique, preserva ordem


def _log(
    db: Session,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    user_id: str = "default",
    extra_data: dict | None = None,
) -> None:
    """Grava uma entrada no ActivityLog (append-only)."""
    entry = ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        extra_data=extra_data or {},
    )
    db.add(entry)
    # NÃO faz commit aqui — o caller faz junto com outras mudanças


# ── Schemas ───────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    body: str
    user_id: str = "default"
    mentions: list[str] = []          # frontend pode enviar ou deixar vazio


class CommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: str
    body: str
    mentions: list[str]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ActivityLogResponse(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    user_id: str
    action: str
    metadata: dict = {}          # mapeado de extra_data (nome DB: metadata)
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _remap_extra_data(cls, obj: object) -> object:
        """extra_data no modelo ORM → metadata no JSON de resposta."""
        if hasattr(obj, "extra_data"):
            return {
                "id":          obj.id,
                "entity_type": obj.entity_type,
                "entity_id":   obj.entity_id,
                "user_id":     obj.user_id,
                "action":      obj.action,
                "metadata":    obj.extra_data or {},
                "created_at":  obj.created_at,
            }
        return obj


# ── Comentários ───────────────────────────────────────────────────────────────

@comments_router.get("/task/{task_id}", response_model=list[CommentResponse])
def list_comments(task_id: uuid.UUID, db: Session = Depends(get_db)):
    """Retorna todos os comentários não-deletados de uma task, em ordem cronológica."""
    return (
        db.query(Comment)
        .filter(Comment.task_id == task_id, Comment.deleted_at == None)  # noqa: E711
        .order_by(Comment.created_at.asc())
        .all()
    )


@comments_router.post("/task/{task_id}", response_model=CommentResponse)
def create_comment(
    task_id: uuid.UUID,
    data: CommentCreate,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Cria um comentário.
    - body passa pelo conform_description (ConformityEngine)
    - menções extraídas do body + merge com as enviadas pelo frontend
    - ActivityLog { action: "commented" } gerado automaticamente
    """
    # user_id do token se autenticado
    user_id = auth["user_id"] if auth else data.user_id

    conformed_body = conform_description(data.body)
    if not conformed_body.strip():
        raise HTTPException(status_code=422, detail="Comentário não pode ser vazio após conformidade")

    extracted    = _extract_mentions(conformed_body)
    all_mentions = list(dict.fromkeys(extracted + [m for m in data.mentions if m not in extracted]))

    comment = Comment(
        task_id  = task_id,
        user_id  = user_id,
        body     = conformed_body,
        mentions = all_mentions,
    )
    db.add(comment)

    _log(
        db,
        entity_type = "task",
        entity_id   = task_id,
        action      = "commented",
        user_id     = user_id,
        extra_data  = {
            "comment_id": str(comment.id),
            "preview":    conformed_body[:80] + ("…" if len(conformed_body) > 80 else ""),
            "mentions":   all_mentions,
        },
    )

    db.commit()
    db.refresh(comment)
    return comment


@comments_router.delete("/{comment_id}")
def delete_comment(comment_id: uuid.UUID, db: Session = Depends(get_db)):
    """Soft-delete: marca deleted_at — não remove do banco."""
    comment = db.query(Comment).filter(
        Comment.id == comment_id,
        Comment.deleted_at == None,  # noqa: E711
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comentário não encontrado")
    comment.deleted_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


# ── Feed de atividade ─────────────────────────────────────────────────────────

@activity_router.get("/entity/{entity_type}/{entity_id}", response_model=list[ActivityLogResponse])
def get_activity(
    entity_type: str,
    entity_id: uuid.UUID,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Retorna o log de atividade de uma entidade, mais recentes primeiro."""
    return (
        db.query(ActivityLog)
        .filter(
            ActivityLog.entity_type == entity_type,
            ActivityLog.entity_id == entity_id,
        )
        .order_by(ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
