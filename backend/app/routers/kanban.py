"""
V2 — Colunas Kanban por projeto.

Lei: sempre existe pelo menos uma coluna is_done; não remover última is_done.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user, get_current_workspace, assert_project_in_workspace
from app.database import get_db
from app.models.kanban import KanbanColumn
from app.models.project import Project
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.models.activity import ActivityLog
from app.v2_seed import ensure_project_kanban_defaults

router = APIRouter()


class ColumnCreate(BaseModel):
    name: str
    slug: str
    color: str = "#4a4a6a"
    order: int = 0
    is_default: bool = False
    is_done: bool = False


class ColumnPatch(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_default: Optional[bool] = None
    is_done: Optional[bool] = None


class ColumnOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    slug: str
    color: str
    order: int
    is_default: bool
    is_done: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ReorderItem(BaseModel):
    id: uuid.UUID
    order: int


class ReorderBody(BaseModel):
    items: list[ReorderItem]


def _done_count(db: Session, project_id: uuid.UUID) -> int:
    return (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id, KanbanColumn.is_done.is_(True))
        .count()
    )


@router.get("/{project_id}", response_model=list[ColumnOut])
def list_columns(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    assert_project_in_workspace(str(project_id), current_workspace, db)
    ensure_project_kanban_defaults(db, project_id)
    q = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.order, KanbanColumn.created_at)
    )
    return q.all()


@router.post("/{project_id}/columns", response_model=ColumnOut)
def create_column(
    project_id: uuid.UUID,
    body: ColumnCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    assert_project_in_workspace(str(project_id), current_workspace, db)
    ensure_project_kanban_defaults(db, project_id)
    slug = body.slug.strip().lower().replace(" ", "_")[:64]
    if db.query(KanbanColumn).filter(KanbanColumn.project_id == project_id, KanbanColumn.slug == slug).first():
        raise HTTPException(status_code=400, detail="Slug já existe neste projeto")

    if body.is_default:
        db.query(KanbanColumn).filter(KanbanColumn.project_id == project_id).update({KanbanColumn.is_default: False})

    col = KanbanColumn(
        project_id=project_id,
        name=body.name.strip()[:128],
        slug=slug,
        color=body.color[:16],
        order=body.order,
        is_default=body.is_default,
        is_done=body.is_done,
    )
    db.add(col)
    db.flush()
    if _done_count(db, project_id) == 0:
        col.is_done = True
    db.commit()
    db.refresh(col)
    return col


@router.patch("/columns/{column_id}", response_model=ColumnOut)
def patch_column(
    column_id: uuid.UUID,
    body: ColumnPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    col = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Coluna não encontrada")
    p = db.query(Project).filter(Project.id == col.project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")

    if body.is_done is False:
        others = (
            db.query(KanbanColumn)
            .filter(
                KanbanColumn.project_id == col.project_id,
                KanbanColumn.id != col.id,
                KanbanColumn.is_done.is_(True),
            )
            .count()
        )
        if col.is_done and others == 0:
            raise HTTPException(status_code=400, detail="Não é possível remover a última coluna de conclusão (is_done)")

    if body.is_default is True:
        db.query(KanbanColumn).filter(KanbanColumn.project_id == col.project_id).update(
            {KanbanColumn.is_default: False}
        )

    if body.name is not None:
        col.name = body.name.strip()[:128]
    if body.slug is not None:
        col.slug = body.slug.strip().lower().replace(" ", "_")[:64]
    if body.color is not None:
        col.color = body.color[:16]
    if body.order is not None:
        col.order = body.order
    if body.is_default is not None:
        col.is_default = body.is_default
    if body.is_done is not None:
        col.is_done = body.is_done

    db.commit()
    db.refresh(col)
    if _done_count(db, col.project_id) == 0:
        col.is_done = True
        db.commit()
        db.refresh(col)
    return col


@router.delete("/columns/{column_id}")
def delete_column(
    column_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    col = db.query(KanbanColumn).filter(KanbanColumn.id == column_id).first()
    if not col:
        raise HTTPException(status_code=404, detail="Coluna não encontrada")
    p = db.query(Project).filter(Project.id == col.project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")

    if col.is_done:
        others = (
            db.query(KanbanColumn)
            .filter(
                KanbanColumn.project_id == col.project_id,
                KanbanColumn.id != col.id,
                KanbanColumn.is_done.is_(True),
            )
            .count()
        )
        if others == 0:
            raise HTTPException(status_code=400, detail="Não é possível excluir a última coluna de conclusão")

    # ActivityLog before cascade delete
    affected_tasks = db.query(Task).filter(Task.status == col.slug, Task.project_id == col.project_id).count()
    db.add(ActivityLog(
        entity_type="project",
        entity_id=col.project_id,
        user_id=str(current_user.id),
        action="column_deleted",
        extra_data={"column_id": str(col.id), "name": col.name, "slug": col.slug, "affected_records": affected_tasks},
    ))

    db.delete(col)
    db.commit()
    return {"ok": True}


@router.post("/columns/reorder")
def reorder_columns(
    body: ReorderBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    for item in body.items:
        c = db.query(KanbanColumn).filter(KanbanColumn.id == item.id).first()
        if c:
            p = db.query(Project).filter(Project.id == c.project_id, Project.workspace_id == current_workspace.id).first()
            if not p:
                continue
            c.order = item.order
    db.commit()
    return {"ok": True}
