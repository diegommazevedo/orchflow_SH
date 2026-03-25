"""
roi.py — Sprint 4

Dashboard de ROI: tempo investido por quadrante, por projeto, velocidade e prazos.
Pergunta central: "estou investindo meu tempo no lugar certo?"

GET /api/roi/summary          — visão geral (todos os projetos ou filtro por project_id)
GET /api/roi/timeline         — tempo por dia (últimos N dias)
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.task import EisenhowerQuadrant, Task, TaskStatus

router = APIRouter()

# ── helpers ───────────────────────────────────────────────────────────────────

QUADRANT_NAMES = {
    "q1": "Urgente + Importante",
    "q2": "Importante",
    "q3": "Urgente",
    "q4": "Baixa prioridade",
}


def _focus_score(time_by_q: dict[str, int]) -> float:
    """
    Focus score = % do tempo no quadrante q2 (estratégico, importante, não urgente).
    Ideal: >60% no q2. Resultado em 0.0–1.0.
    """
    total = sum(time_by_q.values())
    if total == 0:
        return 0.0
    return round(time_by_q.get("q2", 0) / total, 3)


def _focus_label(score: float) -> str:
    if score >= 0.6:
        return "Foco estratégico"
    if score >= 0.35:
        return "Equilibrado"
    return "Modo apaga-incêndio"


def _focus_color(score: float) -> str:
    if score >= 0.6:
        return "green"
    if score >= 0.35:
        return "amber"
    return "red"


def _parse_due(iso: str | None) -> date | None:
    if not iso:
        return None
    try:
        return date.fromisoformat(iso[:10])
    except (ValueError, TypeError):
        return None


# ── /summary ─────────────────────────────────────────────────────────────────

@router.get("/summary")
def roi_summary(
    project_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Agrega métricas ROI.
    project_id = None → visão global (todos os projetos).
    """
    q = db.query(Task).filter(Task.deleted_at.is_(None))
    if project_id:
        q = q.filter(Task.project_id == project_id)
    tasks = q.all()

    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    month_start = today.replace(day=1)

    # ── tempo por quadrante
    time_by_q: dict[str, int] = {qv.value: 0 for qv in EisenhowerQuadrant}
    for t in tasks:
        time_by_q[t.quadrant.value] += t.time_spent_minutes or 0

    # ── status counts
    status_counts = {sv.value: 0 for sv in TaskStatus}
    for t in tasks:
        status_counts[t.status.value] += 1

    # ── tempo por projeto (top 10 por tempo)
    project_time: dict[str, dict] = {}
    for t in tasks:
        pid = str(t.project_id)
        if pid not in project_time:
            project_time[pid] = {
                "project_id": pid,
                "name": t.project.name if t.project else "—",
                "minutes": 0,
                "tasks_total": 0,
                "tasks_done": 0,
            }
        project_time[pid]["minutes"] += t.time_spent_minutes or 0
        project_time[pid]["tasks_total"] += 1
        if t.status == TaskStatus.done:
            project_time[pid]["tasks_done"] += 1

    time_by_project = sorted(
        project_time.values(), key=lambda x: x["minutes"], reverse=True
    )[:10]

    # ── prazos
    overdue: list[dict] = []
    approaching: list[dict] = []  # vence nos próximos 7 dias
    for t in tasks:
        if t.status == TaskStatus.done:
            continue
        d = _parse_due(t.due_date_iso)
        if not d:
            continue
        delta = (d - today).days
        entry = {
            "task_id": str(t.id),
            "title": t.title,
            "due_date": t.due_date_iso,
            "days": delta,
            "quadrant": t.quadrant.value,
        }
        if delta < 0:
            overdue.append(entry)
        elif delta <= 7:
            approaching.append(entry)

    overdue.sort(key=lambda x: x["days"])
    approaching.sort(key=lambda x: x["days"])

    # ── velocidade (tasks done esta semana / este mês)
    done_this_week = sum(
        1 for t in tasks
        if t.status == TaskStatus.done and t.created_at and t.created_at.date() >= week_start
    )
    done_this_month = sum(
        1 for t in tasks
        if t.status == TaskStatus.done and t.created_at and t.created_at.date() >= month_start
    )

    total_time = sum(time_by_q.values())
    score = _focus_score(time_by_q)

    return {
        "total_time_minutes": total_time,
        "total_time_hours": round(total_time / 60, 1),
        "tasks_total": len(tasks),
        "tasks_by_status": status_counts,
        "time_by_quadrant": {
            q: {
                "minutes": m,
                "hours": round(m / 60, 1),
                "pct": round(m / total_time * 100) if total_time else 0,
                "label": QUADRANT_NAMES[q],
            }
            for q, m in time_by_q.items()
        },
        "focus_score": score,
        "focus_score_pct": round(score * 100),
        "focus_label": _focus_label(score),
        "focus_color": _focus_color(score),
        "time_by_project": time_by_project,
        "overdue": overdue[:5],
        "approaching": approaching[:5],
        "velocity": {
            "done_this_week": done_this_week,
            "done_this_month": done_this_month,
        },
    }


# ── /timeline ─────────────────────────────────────────────────────────────────

@router.get("/timeline")
def roi_timeline(
    days: int = Query(30, ge=7, le=90),
    project_id: Optional[uuid.UUID] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Retorna tempo registrado e tasks concluídas por dia nos últimos N dias.
    Nota: time_spent_minutes não tem timestamp de quando foi registrado — usamos
    created_at da task como proxy para construir a timeline de criação/conclusão.
    """
    today = date.today()
    start = today - timedelta(days=days - 1)

    q = db.query(Task).filter(Task.deleted_at.is_(None))
    if project_id:
        q = q.filter(Task.project_id == project_id)
    tasks = q.all()

    # Inicializa todos os dias
    day_map: dict[str, dict] = {}
    for i in range(days):
        d = (start + timedelta(days=i)).isoformat()
        day_map[d] = {"date": d, "tasks_created": 0, "tasks_done": 0, "minutes": 0}

    for t in tasks:
        if t.created_at:
            d = t.created_at.date().isoformat()
            if d in day_map:
                day_map[d]["tasks_created"] += 1
                # distribui tempo no dia de criação como proxy
                day_map[d]["minutes"] += t.time_spent_minutes or 0
        if t.status == TaskStatus.done and t.created_at:
            d = t.created_at.date().isoformat()
            if d in day_map:
                day_map[d]["tasks_done"] += 1

    return {
        "days": list(day_map.values()),
        "period_days": days,
    }
