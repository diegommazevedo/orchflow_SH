"""V2 — slugs de colunas concluídas por projeto (para métricas done)."""
from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models.kanban import KanbanColumn


def done_status_slugs(db: Session, project_id: uuid.UUID) -> set[str]:
    slugs = {
        r[0]
        for r in db.query(KanbanColumn.slug)
        .filter(KanbanColumn.project_id == project_id, KanbanColumn.is_done.is_(True))
        .all()
    }
    return slugs if slugs else {"done"}


def task_status_slug(task) -> str:
    s = task.status
    if s is None:
        return "backlog"
    if hasattr(s, "value"):
        return str(s.value)
    return str(s)


def task_is_done(db: Session, task) -> bool:
    return task_status_slug(task) in done_status_slugs(db, task.project_id)
