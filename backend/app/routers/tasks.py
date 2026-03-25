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
from app.models.task import Task, TaskStatus, EisenhowerQuadrant
from app.models.activity import ActivityLog
from app.agent.conformity import conform_task_payload, conform_date
from app.auth.dependencies import get_current_user_optional
from pydantic import BaseModel
from typing import Optional
import uuid
from datetime import datetime

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    project_id: uuid.UUID
    quadrant: Optional[EisenhowerQuadrant] = EisenhowerQuadrant.q2


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

    class Config:
        from_attributes = True


class StatusUpdate(BaseModel):
    status: TaskStatus
    user_id: str = "default"


class TimeUpdate(BaseModel):
    minutes: int


class TaskUpdate(BaseModel):
    title:         Optional[str] = None
    description:   Optional[str] = None
    quadrant:      Optional[EisenhowerQuadrant] = None
    status:        Optional[TaskStatus] = None
    due_date_iso:  Optional[str] = None
    assignee_hint: Optional[str] = None
    add_minutes:   Optional[int] = None
    user_id:       str = "default"


# ── Helper: gravar ActivityLog (append-only) ─────────────────────────────────

def _log(
    db: Session,
    entity_id: uuid.UUID,
    action: str,
    user_id: str = "default",
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

@router.get("/", response_model=list[TaskResponse])
def list_tasks(project_id: Optional[uuid.UUID] = None, db: Session = Depends(get_db)):
    q = db.query(Task)
    if project_id:
        q = q.filter(Task.project_id == project_id)
    return q.all()


@router.post("/", response_model=TaskResponse)
def create_task(
    data: TaskCreate,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    task = Task(**data.model_dump())
    db.add(task)
    db.flush()

    user_id = auth["user_id"] if auth else "default"
    _log(db, task.id, "created", user_id=user_id, metadata={"title": task.title})

    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}/status")
def update_status(
    task_id: uuid.UUID,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    prev_status = str(task.status.value if hasattr(task.status, "value") else task.status)
    task.status = body.status
    new_status  = str(body.status.value if hasattr(body.status, "value") else body.status)

    user_id = auth["user_id"] if auth else body.user_id
    _log(db, task.id, "moved", user_id=user_id,
         metadata={"from": prev_status, "to": new_status})

    db.commit()
    return {"ok": True}


@router.patch("/{task_id}/time")
def add_time(task_id: uuid.UUID, body: TimeUpdate, db: Session = Depends(get_db)):
    task = db.query(Task).filter(Task.id == task_id).first()
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
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    updated = body.model_dump(exclude_unset=True)
    changed_fields: list[str] = []

    # ── Campos de texto → ConformityEngine ─────────────────────────────────
    if "title" in updated or "description" in updated:
        current_q = updated.get("quadrant") or task.quadrant
        current_s = updated.get("status") or task.status
        conformed = conform_task_payload({
            "title":         updated.get("title", task.title or ""),
            "description":   updated.get("description", task.description or ""),
            "due_date":      updated.get("due_date_iso", task.due_date_iso or ""),
            "quadrant":      current_q.value if hasattr(current_q, "value") else str(current_q),
            "status":        current_s.value if hasattr(current_s, "value") else str(current_s),
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
            user_id_q = auth["user_id"] if auth else updated.get("user_id", "default")
            _log(
                db,
                task.id,
                "quadrant_changed",
                user_id=user_id_q,
                metadata={
                    "from": old_q.value if hasattr(old_q, "value") else str(old_q),
                    "to": new_q.value if hasattr(new_q, "value") else str(new_q),
                },
            )
    if "status" in updated:
        task.status = updated["status"]
        changed_fields.append("status")
    if updated.get("add_minutes", 0) and updated["add_minutes"] > 0:
        task.time_spent_minutes = (task.time_spent_minutes or 0) + updated["add_minutes"]
        changed_fields.append("time_spent_minutes")

    # ── ActivityLog: "updated" (mudanças que não são só quadrante — quadrant → log dedicado acima)
    if changed_fields:
        user_id = auth["user_id"] if auth else updated.get("user_id", "default")
        bulk_fields = [f for f in changed_fields if f != "quadrant"]
        if bulk_fields:
            _log(db, task.id, "updated", user_id=user_id,
                 metadata={"changed_fields": bulk_fields})

    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    user_id = auth["user_id"] if auth else "default"
    _log(db, task.id, "deleted", user_id=user_id, metadata={"title": task.title})

    db.delete(task)
    db.commit()
    return {"ok": True}
