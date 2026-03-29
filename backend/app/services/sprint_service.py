"""
services/sprint_service.py — Sprint 7

Lógica de negócio para sprints tipados:
  - create_sprint: validações por tipo
  - close_sprint: move tasks incompletas, auto-cria próximo se recorrente
  - _create_next_sprint: gera próximo sprint da série recorrente
  - get_sprint_series: retorna série completa
"""

import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.sprint import Sprint, SprintStatus, SprintTask
from app.models.task import Task
from app.models.kanban import KanbanColumn
from app.models.activity import ActivityLog
from app.kanban_helpers import done_status_slugs, task_is_done
from app.agent.conformity import conform_title


def _log(db: Session, entity_id: uuid.UUID, action: str, user_id: str, extra_data: dict | None = None):
    db.add(ActivityLog(
        entity_type="sprint",
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        extra_data=extra_data or {},
    ))


def validate_sprint_create(data) -> None:
    """Validações de negócio antes de criar sprint."""
    if data.type == "recorrente":
        if not data.recurrence_unit:
            raise HTTPException(status_code=422, detail="Sprint recorrente exige recurrence_unit.")
        if not data.recurrence_interval or data.recurrence_interval < 1:
            raise HTTPException(status_code=422, detail="Sprint recorrente exige recurrence_interval >= 1.")
    if data.type == "encaixe":
        # Encaixe nunca auto-cria
        data.auto_create = False


def close_sprint(sprint_id: uuid.UUID, user_id: str, db: Session) -> dict:
    """
    Fecha sprint:
    1. Status → completed
    2. Tasks incompletas → backlog
    3. Se recorrente + auto_create → cria próximo
    4. ActivityLog
    """
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")
    if sprint.status != SprintStatus.active:
        raise HTTPException(status_code=409, detail="Sprint não está ativo")

    # Get done slugs for this project
    done_slugs = done_status_slugs(db, sprint.project_id)

    # Find backlog slug (first non-done column, or "backlog")
    first_col = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == sprint.project_id, KanbanColumn.is_done.is_(False))
        .order_by(KanbanColumn.order)
        .first()
    )
    backlog_slug = first_col.slug if first_col else "backlog"

    # Get sprint tasks
    sprint_task_rows = db.query(SprintTask).filter(SprintTask.sprint_id == sprint_id).all()
    task_ids = [st.task_id for st in sprint_task_rows]

    # Move incomplete tasks to backlog
    tasks_moved = 0
    if task_ids:
        tasks = db.query(Task).filter(Task.id.in_(task_ids), Task.deleted_at.is_(None)).all()
        for t in tasks:
            status_str = str(t.status.value if hasattr(t.status, "value") else t.status)
            if status_str not in done_slugs:
                t.status = backlog_slug
                tasks_moved += 1

    # Calculate velocity
    done_count = 0
    if task_ids:
        all_tasks = db.query(Task).filter(Task.id.in_(task_ids), Task.deleted_at.is_(None)).all()
        done_count = sum(1 for t in all_tasks if task_is_done(db, t))

    # Close sprint
    sprint.status = SprintStatus.completed
    sprint.end_date = date.today().isoformat()
    sprint.velocity = done_count

    # Auto-create next sprint if recorrente + auto_create
    next_sprint = None
    if sprint.type == "recorrente" and sprint.auto_create:
        next_sprint = _create_next_sprint(sprint, user_id, db)

    _log(db, sprint.id, "sprint_closed", user_id, {
        "name": sprint.name,
        "tasks_moved": tasks_moved,
        "velocity": done_count,
        "next_sprint_id": str(next_sprint.id) if next_sprint else None,
    })

    db.commit()
    db.refresh(sprint)
    if next_sprint:
        db.refresh(next_sprint)

    return {
        "closed": sprint,
        "next": next_sprint,
        "tasks_moved": tasks_moved,
    }


def _create_next_sprint(sprint: Sprint, user_id: str, db: Session) -> Sprint:
    """Create next sprint in a recurrent series."""
    # Calculate next start date
    next_start = _calc_next_date(sprint)

    # Calculate duration from original sprint
    duration_days = 14  # default 2 weeks
    if sprint.start_date and sprint.end_date:
        try:
            s = date.fromisoformat(sprint.start_date)
            e = date.fromisoformat(sprint.end_date)
            duration_days = max((e - s).days, 1)
        except ValueError:
            pass

    next_end = (next_start + timedelta(days=duration_days)).isoformat()

    # Extract base name (remove " #N" suffix if present)
    base_name = sprint.name
    if " #" in base_name:
        base_name = base_name.rsplit(" #", 1)[0]

    next_seq = (sprint.sequence_number or 1) + 1

    next_sprint = Sprint(
        project_id=sprint.project_id,
        name=f"{base_name} #{next_seq}",
        goal=sprint.goal,
        type="recorrente",
        recurrence_unit=sprint.recurrence_unit,
        recurrence_interval=sprint.recurrence_interval,
        auto_create=True,
        parent_sprint_id=sprint.id,
        sequence_number=next_seq,
        start_date=next_start.isoformat(),
        end_date=next_end,
        status=SprintStatus.planning,
    )
    db.add(next_sprint)
    db.flush()

    # Copy recurring tasks from closed sprint
    sprint_task_rows = db.query(SprintTask).filter(SprintTask.sprint_id == sprint.id).all()
    task_ids = [st.task_id for st in sprint_task_rows]
    if task_ids:
        recurring_tasks = (
            db.query(Task)
            .filter(Task.id.in_(task_ids), Task.is_recurring.is_(True), Task.deleted_at.is_(None))
            .all()
        )
        for t in recurring_tasks:
            # Create new task instance (copy, not move)
            new_task = Task(
                title=t.title,
                description=t.description,
                status="backlog",
                quadrant=t.quadrant,
                project_id=t.project_id,
                assignee_id=t.assignee_id,
                is_recurring=True,
                recurring_template_id=t.id,
            )
            db.add(new_task)
            db.flush()
            db.add(SprintTask(sprint_id=next_sprint.id, task_id=new_task.id))

    _log(db, next_sprint.id, "sprint_auto_created", user_id, {
        "name": next_sprint.name,
        "parent_sprint_id": str(sprint.id),
        "sequence_number": next_seq,
        "recurring_tasks_copied": len(task_ids) if task_ids else 0,
    })

    return next_sprint


def _calc_next_date(sprint: Sprint) -> date:
    """Calculate start date for next sprint in series."""
    base = date.today()
    if sprint.end_date:
        try:
            base = date.fromisoformat(sprint.end_date)
        except ValueError:
            pass

    interval = sprint.recurrence_interval or 1
    unit = sprint.recurrence_unit or "weekly"

    if unit == "daily":
        return base + timedelta(days=interval)
    elif unit == "weekly":
        return base + timedelta(weeks=interval)
    elif unit == "monthly":
        # Approximate: 30 days per month
        return base + timedelta(days=30 * interval)
    return base + timedelta(weeks=interval)


def get_sprint_series(sprint_id: uuid.UUID, db: Session) -> list[Sprint]:
    """Get the full series of a recurring sprint (root + all children)."""
    sprint = db.query(Sprint).filter(Sprint.id == sprint_id).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Sprint não encontrado")

    # Find root
    root = sprint
    while root.parent_sprint_id:
        parent = db.query(Sprint).filter(Sprint.id == root.parent_sprint_id).first()
        if not parent:
            break
        root = parent

    # Collect full chain from root
    series = [root]
    current = root
    while True:
        child = db.query(Sprint).filter(Sprint.parent_sprint_id == current.id).first()
        if not child:
            break
        series.append(child)
        current = child

    return series
