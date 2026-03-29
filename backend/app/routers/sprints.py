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
from app.models.project import Project
from app.models.sprint import Sprint, SprintStatus, SprintTask
from app.models.task import Task
from app.kanban_helpers import task_is_done
from app.models.activity import ActivityLog
from app.agent.conformity import conform_title, conform_description
from app.auth.dependencies import get_current_user, get_current_workspace
from app.models.user import User
from app.models.workspace import Workspace
from app.services.sprint_service import (
    validate_sprint_create,
    close_sprint as service_close_sprint,
    get_sprint_series as service_get_sprint_series,
)

router = APIRouter(dependencies=[Depends(get_current_user), Depends(get_current_workspace)])


# ── Helper: ActivityLog (append-only) ─────────────────────────────────────────

def _log(
    db: Session,
    entity_id: uuid.UUID,
    action: str,
    user_id: str,
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
    user_id: Optional[str] = None
    # Sprint 7
    type: str = "standard"
    recurrence_unit: Optional[str] = None
    recurrence_interval: Optional[int] = None
    auto_create: bool = False


class SprintUpdate(BaseModel):
    name: Optional[str] = None
    goal: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[SprintStatus] = None
    user_id: Optional[str] = None
    # Sprint 7 — type cannot be changed after creation
    recurrence_unit: Optional[str] = None
    recurrence_interval: Optional[int] = None
    auto_create: Optional[bool] = None


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
    # Sprint 7
    type: str = "standard"
    recurrence_unit: Optional[str] = None
    recurrence_interval: Optional[int] = None
    auto_create: bool = False
    parent_sprint_id: Optional[uuid.UUID] = None
    sequence_number: int = 1

    class Config:
        from_attributes = True


class SprintCloseResult(BaseModel):
    closed_sprint_id: str
    tasks_moved_to_backlog: int
    next_sprint: Optional[SprintResponse] = None


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
def list_sprints(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Lista todos os sprints do projeto, mais recentes primeiro."""
    return (
        db.query(Sprint)
        .join(Project, Project.id == Sprint.project_id)
        .filter(Sprint.project_id == project_id, Project.workspace_id == current_workspace.id)
        .order_by(Sprint.created_at.desc())
        .all()
    )


@router.post("/", response_model=SprintResponse)
def create_sprint(data: SprintCreate, db: Session = Depends(get_db)):
    """
    Cria um sprint (standard, recorrente ou encaixe).
    - name  → conform_title (ConformityEngine)
    - goal  → conform_description (ConformityEngine)
    - Validações por tipo via sprint_service
    """
    validate_sprint_create(data)
    conformed_name = conform_title(data.name)
    conformed_goal = conform_description(data.goal) if data.goal else None

    sprint = Sprint(
        project_id          = data.project_id,
        name                = conformed_name,
        goal                = conformed_goal,
        start_date          = data.start_date,
        end_date            = data.end_date,
        type                = data.type,
        recurrence_unit     = data.recurrence_unit,
        recurrence_interval = data.recurrence_interval,
        auto_create         = data.auto_create,
    )
    db.add(sprint)
    db.flush()

    _log(db, sprint.id, "created",
         user_id    = data.user_id,
         extra_data = {"name": conformed_name, "type": data.type})

    db.commit()
    db.refresh(sprint)
    return sprint


@router.patch("/{sprint_id}", response_model=SprintResponse)
def update_sprint(sprint_id: uuid.UUID, data: SprintUpdate, db: Session = Depends(get_db)):
    """Atualiza campos do sprint — name e goal passam pelo ConformityEngine. Type não pode mudar."""
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
    # Sprint 7 fields
    if data.recurrence_unit is not None:
        sprint.recurrence_unit = data.recurrence_unit
    if data.recurrence_interval is not None:
        sprint.recurrence_interval = data.recurrence_interval
    if data.auto_create is not None:
        sprint.auto_create = data.auto_create

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

@router.post("/{sprint_id}/close", response_model=SprintCloseResult)
def close_sprint_endpoint(
    sprint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """
    Fecha sprint (Sprint 7):
    - Move tasks incompletas para backlog
    - Se recorrente + auto_create: gera próximo sprint
    """
    # Verify sprint belongs to workspace
    sprint = (
        db.query(Sprint)
        .join(Project, Project.id == Sprint.project_id)
        .filter(Sprint.id == sprint_id, Project.workspace_id == current_workspace.id)
        .first()
    )
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    result = service_close_sprint(sprint_id, str(current_user.id), db)
    return SprintCloseResult(
        closed_sprint_id=str(result["closed"].id),
        tasks_moved_to_backlog=result["tasks_moved"],
        next_sprint=result["next"],
    )


@router.get("/{sprint_id}/series", response_model=list[SprintResponse])
def get_series(
    sprint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Retorna série completa de um sprint recorrente."""
    sprint = (
        db.query(Sprint)
        .join(Project, Project.id == Sprint.project_id)
        .filter(Sprint.id == sprint_id, Project.workspace_id == current_workspace.id)
        .first()
    )
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")
    return service_get_sprint_series(sprint_id, db)


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
        candidates = (
            db.query(Task)
            .filter(Task.id.in_(task_ids), Task.deleted_at.is_(None))
            .all()
        )
        done_count = sum(1 for t in candidates if task_is_done(db, t))

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
def get_sprint_board(
    sprint_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """
    Retorna as tasks do sprint agrupadas por status.
    Usado pelo SprintPage para montar o board filtrado.
    """
    sprint = (
        db.query(Sprint)
        .join(Project, Project.id == Sprint.project_id)
        .filter(Sprint.id == sprint_id, Project.workspace_id == current_workspace.id)
        .first()
    )
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    task_ids = [st.task_id for st in
                db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()]

    if not task_ids:
        return {"sprint_id": str(sprint_id), "columns": [], "tasks": []}

    tasks = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.id.in_(task_ids), Task.deleted_at.is_(None), Project.workspace_id == current_workspace.id)
        .all()
    )

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
