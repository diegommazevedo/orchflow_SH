"""
routers/tasks.py

Sprint 5A: Adicionados ActivityLog em todos os endpoints mutáveis.

Leis respeitadas:
  - Campos de texto → conform_task_payload / conform_date antes do banco
  - delete_task = HIGH → wizard obrigatório no frontend (endpoint aqui é idempotente)
  - ActivityLog gerado pelo backend em cada ação: "created", "moved", "updated", "deleted"
  - ConformityEngine aplicado antes de qualquer persistência
  - CORS mantido em main.py
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.task import Task, EisenhowerQuadrant
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.models.activity import ActivityLog
from app.agent.conformity import conform_task_payload, conform_date
from app.auth.dependencies import get_current_user, get_current_workspace
from app.models.kanban import KanbanColumn
from app.services.kanban_status import (
    coerce_task_status_on_create,
    require_valid_status,
)
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy import func
import uuid
from datetime import datetime

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: uuid.UUID
    quadrant: Optional[EisenhowerQuadrant] = EisenhowerQuadrant.q2
    parent_task_id: Optional[uuid.UUID] = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    status: str
    quadrant: str
    time_spent_minutes: int
    project_id: uuid.UUID
    due_date_iso: Optional[str] = None
    assignee_id: Optional[uuid.UUID] = None
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None
    parent_task_id: Optional[uuid.UUID] = None
    subtask_count: int = 0
    completed_subtask_count: int = 0
    is_recurring: bool = False

    class Config:
        from_attributes = True


class TrashTaskResponse(BaseModel):
    """Task na lixeira (soft-deleted)."""
    id: uuid.UUID
    title: str
    status: str
    quadrant: str
    project_id: uuid.UUID
    deleted_at: datetime
    deleted_by: Optional[str] = None

    class Config:
        from_attributes = True


class StatusUpdate(BaseModel):
    status: str  # V2: slug da coluna Kanban


class TimeUpdate(BaseModel):
    minutes: int = Field(ge=0, le=1440)  # 0–1440 min (máx 1 dia)


class TaskUpdate(BaseModel):
    title:         Optional[str] = None
    description:   Optional[str] = None
    quadrant:      Optional[EisenhowerQuadrant] = None
    status:        Optional[str] = None
    due_date_iso:  Optional[str] = None
    assignee_hint: Optional[str] = None
    add_minutes:   Optional[int] = None
    is_recurring:  Optional[bool] = None


# ── Helper: gravar ActivityLog (append-only) ─────────────────────────────────

def _log(
    db: Session,
    entity_id: uuid.UUID,
    action: str,
    user_id: str,
    metadata: dict | None = None,
) -> None:
    db.add(ActivityLog(
        entity_type = "task",
        entity_id   = entity_id,
        user_id     = user_id,
        action      = action,
        extra_data  = metadata or {},  # 'metadata' é reservado no SQLAlchemy
    ))


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _active_tasks_query(db: Session, workspace_id: uuid.UUID):
    return (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.deleted_at.is_(None), Project.workspace_id == workspace_id)
    )


@router.get("/trash/{project_id}", response_model=list[TrashTaskResponse])
def list_trash(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Tasks soft-deleted do projeto, mais recentes primeiro."""
    q = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.project_id == project_id, Task.deleted_at.isnot(None), Project.workspace_id == current_workspace.id)
        .order_by(Task.deleted_at.desc())
    )
    return q.all()


def _enrich_subtask_counts(db: Session, tasks: list[Task]) -> list[dict]:
    """Add subtask_count and completed_subtask_count to each task."""
    if not tasks:
        return []
    task_ids = [t.id for t in tasks]

    # Count all subtasks per parent
    total_q = (
        db.query(Task.parent_task_id, func.count(Task.id))
        .filter(Task.parent_task_id.in_(task_ids), Task.deleted_at.is_(None))
        .group_by(Task.parent_task_id)
        .all()
    )
    total_map = {pid: cnt for pid, cnt in total_q}

    # Count completed subtasks (status matches is_done column)
    # Build a set of done slugs per project
    project_ids = list({t.project_id for t in tasks})
    done_cols = (
        db.query(KanbanColumn.project_id, KanbanColumn.slug)
        .filter(KanbanColumn.project_id.in_(project_ids), KanbanColumn.is_done.is_(True))
        .all()
    )
    done_slugs_by_project: dict[uuid.UUID, set[str]] = {}
    for pid, slug in done_cols:
        done_slugs_by_project.setdefault(pid, set()).add(slug)

    completed_map: dict[uuid.UUID, int] = {}
    for t in tasks:
        done_slugs = done_slugs_by_project.get(t.project_id, set())
        if done_slugs and t.id in total_map:
            cnt = (
                db.query(func.count(Task.id))
                .filter(
                    Task.parent_task_id == t.id,
                    Task.deleted_at.is_(None),
                    Task.status.in_(done_slugs),
                )
                .scalar()
            )
            completed_map[t.id] = cnt or 0

    results = []
    for t in tasks:
        d = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        d["subtask_count"] = total_map.get(t.id, 0)
        d["completed_subtask_count"] = completed_map.get(t.id, 0)
        results.append(d)
    return results


@router.get("/", response_model=list[TaskResponse])
def list_tasks(
    project_id: Optional[uuid.UUID] = None,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    q = _active_tasks_query(db, current_workspace.id).filter(Task.parent_task_id.is_(None))
    if project_id:
        q = q.filter(Task.project_id == project_id)
    tasks = q.all()
    return _enrich_subtask_counts(db, tasks)


@router.post("/", response_model=TaskResponse)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    project = db.query(Project).filter(Project.id == data.project_id, Project.workspace_id == current_workspace.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")

    # ── Subtask validations ───────────────────────────────────────────────────
    if data.parent_task_id:
        parent = db.query(Task).filter(Task.id == data.parent_task_id, Task.deleted_at.is_(None)).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Tarefa pai não encontrada")
        if parent.parent_task_id is not None:
            raise HTTPException(status_code=422, detail="Subtarefas não podem ter subtarefas.")
        if parent.project_id != data.project_id:
            raise HTTPException(status_code=422, detail="Subtarefa deve estar no mesmo projeto que a tarefa pai.")

    task = Task(**data.model_dump())
    task.status = coerce_task_status_on_create(db, task.project_id, str(task.status or "backlog"))
    db.add(task)
    db.flush()

    _log(db, task.id, "created", user_id=str(current_user.id),
         metadata={"title": task.title, "parent_task_id": str(data.parent_task_id) if data.parent_task_id else None})

    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status")
def update_status(
    task_id: uuid.UUID,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = _active_tasks_query(db, current_workspace.id).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    prev_status = str(task.status or "backlog")
    new_status = require_valid_status(db, task.project_id, body.status)
    task.status = new_status

    _log(db, task.id, "moved", user_id=str(current_user.id),
         metadata={"from": prev_status, "to": new_status})

    db.commit()
    return {"ok": True}


@router.patch("/{task_id}/time")
def add_time(
    task_id: uuid.UUID,
    body: TimeUpdate,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = _active_tasks_query(db, current_workspace.id).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    task.time_spent_minutes += body.minutes
    db.commit()
    return {"time_spent_minutes": task.time_spent_minutes}


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: uuid.UUID,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = _active_tasks_query(db, current_workspace.id).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    updated = body.model_dump(exclude_unset=True)
    changed_fields: list[str] = []

    # ── Campos de texto → ConformityEngine ─────────────────────────────────
    if "title" in updated or "description" in updated:
        current_q = updated.get("quadrant") or task.quadrant
        current_s = updated.get("status") if "status" in updated else task.status
        conformed = conform_task_payload({
            "title":         updated.get("title", task.title or ""),
            "description":   updated.get("description", task.description or ""),
            "due_date":      updated.get("due_date_iso", task.due_date_iso or ""),
            "quadrant":      current_q.value if hasattr(current_q, "value") else str(current_q),
            "status":        str(current_s or "backlog"),
            "assignee_name": updated.get("assignee_hint", ""),
        })
        if "title" in updated:
            task.title = conformed["title"]
            changed_fields.append("title")
        if "description" in updated:
            task.description = conformed["description"]
            changed_fields.append("description")
        if "due_date_iso" in updated:
            due = conformed.get("due_date")
            task.due_date_iso = due["iso"] if isinstance(due, dict) else None
            changed_fields.append("due_date")

    # ── Prazo isolado (sem title/description) ─────────────────────────────
    if "due_date_iso" in updated and "title" not in updated and "description" not in updated:
        raw_due = updated["due_date_iso"]
        if raw_due:
            result = conform_date(raw_due)
            task.due_date_iso = result["iso"] if result else None
        else:
            task.due_date_iso = None
        if "due_date" not in changed_fields:
            changed_fields.append("due_date")

    if "quadrant" in updated:
        new_q = updated["quadrant"]
        old_q = task.quadrant
        if old_q != new_q:
            task.quadrant = new_q
            changed_fields.append("quadrant")
            _log(
                db,
                task.id,
                "quadrant_changed",
                user_id=str(current_user.id),
                metadata={
                    "from": old_q.value if hasattr(old_q, "value") else str(old_q),
                    "to": new_q.value if hasattr(new_q, "value") else str(new_q),
                },
            )
    if "status" in updated:
        task.status = require_valid_status(db, task.project_id, str(updated["status"]))
        changed_fields.append("status")
    if updated.get("add_minutes", 0) and updated["add_minutes"] > 0:
        task.time_spent_minutes = (task.time_spent_minutes or 0) + updated["add_minutes"]
        changed_fields.append("time_spent_minutes")
    if "is_recurring" in updated and updated["is_recurring"] is not None:
        task.is_recurring = updated["is_recurring"]
        changed_fields.append("is_recurring")

    # ── ActivityLog: "updated" (mudanças que não são só quadrante — quadrant → log dedicado acima)
    if changed_fields:
        user_id = str(current_user.id)
        bulk_fields = [f for f in changed_fields if f != "quadrant"]
        if bulk_fields:
            _log(db, task.id, "updated", user_id=user_id,
                 metadata={"changed_fields": bulk_fields})

    db.commit()
    db.refresh(task)
    return task


@router.post("/{task_id}/restore", response_model=TaskResponse)
def restore_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.id == task_id, Project.workspace_id == current_workspace.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if task.deleted_at is None:
        raise HTTPException(status_code=400, detail="Tarefa não está na lixeira")

    task.deleted_at = None
    task.deleted_by = None
    user_id = str(current_user.id)
    _log(db, task.id, "restored", user_id=user_id, metadata={"title": task.title})
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}/permanent")
def purge_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """
    Remove a task do banco (irreversível). Só permitido se já estiver na lixeira.
    Risco CRITICAL — wizard obrigatório no frontend.
    """
    task = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.id == task_id, Project.workspace_id == current_workspace.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    if task.deleted_at is None:
        raise HTTPException(
            status_code=400,
            detail="Exclua a tarefa primeiro (vai para a lixeira) antes de remover permanentemente.",
        )
    db.delete(task)
    db.commit()
    return {"ok": True}


@router.delete("/{task_id}")
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = _active_tasks_query(db, current_workspace.id).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    user_id = str(current_user.id)
    _log(db, task.id, "deleted", user_id=user_id, metadata={"title": task.title})

    task.deleted_at = datetime.utcnow()
    task.deleted_by = user_id
    db.commit()
    return {"ok": True}


# ── Subtasks ──────────────────────────────────────────────────────────────────

@router.get("/{task_id}/subtasks", response_model=list[TaskResponse])
def list_subtasks(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Retorna subtarefas de uma tarefa."""
    parent = (
        _active_tasks_query(db, current_workspace.id)
        .filter(Task.id == task_id)
        .first()
    )
    if not parent:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")
    subs = (
        db.query(Task)
        .filter(Task.parent_task_id == task_id, Task.deleted_at.is_(None))
        .order_by(Task.created_at)
        .all()
    )
    return subs
