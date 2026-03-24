"""
routers/sprints.py

Sprint 5B — Sprint como entidade real com backlog próprio.

Endpoints:
  GET    /api/sprints/project/{project_id}   — lista sprints do projeto
  POST   /api/sprints/                        — cria sprint
  PATCH  /api/sprints/{id}                   — atualiza sprint
  DELETE /api/sprints/{id}                   — remove sprint (somente planning)

  POST   /api/sprints/{id}/start             — inicia sprint → status = active
  POST   /api/sprints/{id}/complete          — conclui sprint → velocity calculado

  POST   /api/sprints/{id}/tasks             — adiciona task ao sprint
  DELETE /api/sprints/{id}/tasks/{task_id}   — remove task do sprint
  GET    /api/sprints/{id}/board             — tasks do sprint agrupadas por status

Leis respeitadas:
  - name → conform_title antes de salvar
  - goal → conform_description antes de salvar
  - ActivityLog gerado no backend para sprint_started e sprint_completed
  - velocity calculado no backend (tasks done) — nunca pelo frontend
  - start_date e end_date armazenados como ISO 8601
  - CORS mantido em main.py
"""
import uuid
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.sprint import Sprint, SprintStatus, SprintTask
from app.models.task import Task, TaskStatus
from app.models.activity import ActivityLog
from app.agent.conformity import conform_title, conform_description

router = APIRouter()


# ── Helper: ActivityLog (append-only) ─────────────────────────────────────────

def _log(
    db: Session,
    entity_id: uuid.UUID,
    action: str,
    user_id: str = "default",
    extra_data: dict | None = None,
) -> None:
    db.add(ActivityLog(
        entity_type = "sprint",
        entity_id   = entity_id,
        user_id     = user_id,
        action      = action,
        extra_data  = extra_data or {},
    ))


# ── Schemas ────────────────────────────────────────────────────────────────────

class SprintCreate(BaseModel):
    project_id: uuid.UUID
    name: str
    goal: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    user_id: str = "default"


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[SprintStatus] = None
    user_id: str = "default"


class SprintResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    goal: Optional[str] = None
    status: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    velocity: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskIdBody(BaseModel):
    task_id: uuid.UUID


class SprintBoardColumn(BaseModel):
    status: str
    label: str
    tasks: list[dict]


# ── Status label map ───────────────────────────────────────────────────────────

STATUS_LABELS = {
    "backlog":     "Backlog",
    "in_progress": "Em andamento",
    "blocked":     "Impedimento",
    "done":        "Concluído",
}


# ── CRUD básico ────────────────────────────────────────────────────────────────

@router.get("/project/{project_id}", response_model=list[SprintResponse])
def list_sprints(project_id: uuid.UUID, db: Session = Depends(get_db)):
    """Lista todos os sprints do projeto, mais recentes primeiro."""
    return (
        db.query(Sprint)
        .filter(Sprint.project_id == project_id)
        .order_by(Sprint.created_at.desc())
        .all()
    )


@router.post("/", response_model=SprintResponse)
def create_sprint(data: SprintCreate, db: Session = Depends(get_db)):
    """
    Cria um sprint.
    - name  → conform_title (ConformityEngine)
    - goal  → conform_description (ConformityEngine)
    """
    conformed_name = conform_title(data.name)
    conformed_goal = conform_description(data.goal) if data.goal else None

    sprint = Sprint(
        project_id = data.project_id,
        name       = conformed_name,
        goal       = conformed_goal,
        start_date = data.start_date,
        end_date   = data.end_date,
    )
    db.add(sprint)
    db.flush()

    _log(db, sprint.id, "created",
         user_id    = data.user_id,
         extra_data = {"name": conformed_name})

    db.commit()
    db.refresh(sprint)
    return sprint


@router.patch("/{sprint_id}", response_model=SprintResponse)
def update_sprint(sprint_id: uuid.UUID, data: SprintUpdate, db: Session = Depends(get_db)):
    """Atualiza campos do sprint — name e goal passam pelo ConformityEngine."""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    if data.name is not None:
        sprint.name = conform_title(data.name)
    if data.goal is not None:
        sprint.goal = conform_description(data.goal)
    if data.start_date is not None:
        sprint.start_date = data.start_date
    if data.end_date is not None:
        sprint.end_date = data.end_date
    if data.status is not None:
        sprint.status = data.status

    db.commit()
    db.refresh(sprint)
    return sprint


@router.delete("/{sprint_id}")
def delete_sprint(sprint_id: uuid.UUID, db: Session = Depends(get_db)):
    """Remove sprint. Só permitido enquanto status = planning."""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")
    if sprint.status not in (SprintStatus.planning, SprintStatus.cancelled):
        raise HTTPException(
            status_code=409,
            detail="Só é possível remover sprints em planejamento ou cancelados",
        )
    db.delete(sprint)
    db.commit()
    return {"ok": True}


# ── Transições de estado ───────────────────────────────────────────────────────

@router.post("/{sprint_id}/start", response_model=SprintResponse)
def start_sprint(sprint_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Inicia o sprint:
    - status = active
    - start_date = hoje (ISO 8601)
    - ActivityLog { action: "sprint_started" }
    """
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")
    if sprint.status != SprintStatus.planning:
        raise HTTPException(status_code=409, detail="Sprint já foi iniciado ou encerrado")

    sprint.status     = SprintStatus.active
    sprint.start_date = date.today().isoformat()

    _log(db, sprint.id, "sprint_started",
         extra_data = {
             "name":       sprint.name,
             "start_date": sprint.start_date,
         })

    db.commit()
    db.refresh(sprint)
    return sprint


@router.post("/{sprint_id}/complete", response_model=SprintResponse)
def complete_sprint(sprint_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Conclui o sprint:
    - status = completed
    - end_date = hoje (ISO 8601)
    - velocity = tasks done neste sprint
    - ActivityLog { action: "sprint_completed", metadata: { velocity, duration_days } }
    """
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")
    if sprint.status != SprintStatus.active:
        raise HTTPException(status_code=409, detail="Sprint não está ativo")

    # ── Velocity: tasks done neste sprint ───────────────────────────────────
    task_ids = [st.task_id for st in
                db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()]
    done_count = 0
    if task_ids:
        done_count = db.query(Task).filter(
            Task.id.in_(task_ids),
            Task.status == TaskStatus.done,
        ).count()

    # ── Duração em dias ─────────────────────────────────────────────────────
    today = date.today()
    duration_days = 0
    if sprint.start_date:
        try:
            start = date.fromisoformat(sprint.start_date)
            duration_days = (today - start).days
        except ValueError:
            pass

    sprint.status   = SprintStatus.completed
    sprint.end_date = today.isoformat()
    sprint.velocity = done_count

    _log(db, sprint.id, "sprint_completed",
         extra_data = {
             "velocity":      done_count,
             "duration_days": duration_days,
             "name":          sprint.name,
         })

    db.commit()
    db.refresh(sprint)
    return sprint


# ── Gestão de tasks no sprint ─────────────────────────────────────────────────

@router.post("/{sprint_id}/tasks")
def add_task_to_sprint(
    sprint_id: uuid.UUID,
    body: TaskIdBody,
    db: Session = Depends(get_db),
):
    """Adiciona uma task ao sprint (idempotente via PK composta)."""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    existing = db.query(SprintTask).filter(
        SprintTask.sprint_id == sprint_id,
        SprintTask.task_id   == body.task_id,
    ).first()
    if existing:
        return {"ok": True, "message": "Task já estava no sprint"}

    db.add(SprintTask(sprint_id=sprint_id, task_id=body.task_id))
    db.commit()
    return {"ok": True}


@router.delete("/{sprint_id}/tasks/{task_id}")
def remove_task_from_sprint(
    sprint_id: uuid.UUID,
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    """Remove uma task do sprint."""
    st = db.query(SprintTask).filter(
        SprintTask.sprint_id == sprint_id,
        SprintTask.task_id   == task_id,
    ).first()
    if not st:
        raise HTTPException(status_code=404, detail="Task não encontrada neste sprint")
    db.delete(st)
    db.commit()
    return {"ok": True}


@router.get("/{sprint_id}/board")
def get_sprint_board(sprint_id: uuid.UUID, db: Session = Depends(get_db)):
    """
    Retorna as tasks do sprint agrupadas por status.
    Usado pelo SprintPage para montar o board filtrado.
    """
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    task_ids = [st.task_id for st in
                db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()]

    if not task_ids:
        return {"sprint_id": str(sprint_id), "columns": [], "tasks": []}

    tasks = db.query(Task).filter(Task.id.in_(task_ids)).all()

    # Serializa tarefas
    task_list = []
    for t in tasks:
        task_list.append({
            "id":                  str(t.id),
            "title":               t.title,
            "description":         t.description,
            "status":              str(t.status.value if hasattr(t.status, "value") else t.status),
            "quadrant":            str(t.quadrant.value if hasattr(t.quadrant, "value") else t.quadrant),
            "time_spent_minutes":  t.time_spent_minutes,
            "project_id":          str(t.project_id),
            "due_date_iso":        t.due_date_iso,
            "assignee_id":         str(t.assignee_id) if t.assignee_id else None,
        })

    # Agrupa por status
    columns = []
    for status_key, label in STATUS_LABELS.items():
        col_tasks = [t for t in task_list if t["status"] == status_key]
        columns.append({
            "status":     status_key,
            "label":      label,
            "task_count": len(col_tasks),
        })

    return {
        "sprint_id": str(sprint_id),
        "columns":   columns,
        "tasks":     task_list,
        "total":     len(task_list),
        "done":      sum(1 for t in task_list if t["status"] == "done"),
    }
