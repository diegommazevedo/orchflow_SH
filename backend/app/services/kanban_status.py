"""Validação de Task.status contra slugs de KanbanColumn do projeto (Frente 1 / V2)."""

import uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.kanban import KanbanColumn
from app.v2_seed import ensure_project_kanban_defaults


def slug_set_for_project(db: Session, project_id: uuid.UUID) -> set[str]:
    ensure_project_kanban_defaults(db, project_id)
    rows = db.query(KanbanColumn.slug).filter(KanbanColumn.project_id == project_id).all()
    return {r[0] for r in rows}


def default_status_slug(db: Session, project_id: uuid.UUID) -> str:
    ensure_project_kanban_defaults(db, project_id)
    d = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id, KanbanColumn.is_default.is_(True))
        .first()
    )
    if d:
        return d.slug
    first = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.order, KanbanColumn.created_at)
        .first()
    )
    return first.slug if first else "backlog"


def require_valid_status(db: Session, project_id: uuid.UUID, status: str) -> str:
    """Garante que status é slug existente; 422 se não."""
    s = (status or "").strip()[:100]
    if not s:
        raise HTTPException(status_code=422, detail="Status vazio")
    slugs = slug_set_for_project(db, project_id)
    if s not in slugs:
        raise HTTPException(
            status_code=422,
            detail=f"Status '{s}' não existe nas colunas Kanban deste projeto",
        )
    return s


def coerce_task_status_on_create(db: Session, project_id: uuid.UUID, status: str) -> str:
    """Se status inicial não existir no projeto, usa coluna padrão."""
    s = (status or "").strip()[:100] or "backlog"
    slugs = slug_set_for_project(db, project_id)
    if s in slugs:
        return s
    return default_status_slug(db, project_id)
