"""
routers/analytics.py

Sprint 6A — Dashboard ROI com dados reais do banco.

Endpoints:
  GET /api/analytics/roi/{user_id}     — métricas consolidadas
  GET /api/analytics/heatmap/{user_id} — últimos 90 dias de atividade

Leis respeitadas:
  - Somente leitura — zero escrita no banco
  - Todos os cálculos (focus_score, streak, velocity) feitos no backend
  - CORS mantido em main.py
"""
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, cast, Date as SADate
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task import Task, TaskStatus
from app.models.sprint import Sprint
from app.models.focus import FocusSession, ProductivitySnapshot

router = APIRouter()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_mood(avg: Optional[float]) -> Optional[str]:
    if avg is None:
        return None
    if avg < 0.5:
        return "blocked"
    if avg < 1.5:
        return "ok"
    return "flow"


def _consecutive_streak(session_dates: list[date]) -> int:
    """Calcula dias consecutivos com pelo menos 1 sessão, a partir de hoje."""
    if not session_dates:
        return 0
    date_set = set(session_dates)
    streak = 0
    check = date.today()
    # Tolera hoje sem sessão (ainda é o dia)
    if check not in date_set:
        check -= timedelta(days=1)
    while check in date_set:
        streak += 1
        check -= timedelta(days=1)
    return streak


# ── GET /api/analytics/roi/{user_id} ─────────────────────────────────────────

@router.get("/roi/{user_id}")
def get_roi(user_id: str, db: Session = Depends(get_db)):
    """Métricas consolidadas de ROI por usuário."""

    today      = date.today()
    week_start = today - timedelta(days=today.weekday())   # segunda-feira da semana
    since_14   = today - timedelta(days=14)

    # ── 1. Focus sessions ─────────────────────────────────────────────────────
    all_sessions = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at != None,          # noqa: E711
            FocusSession.duration_minutes != None,  # noqa: E711
        )
        .all()
    )

    total_focus_min = sum(s.duration_minutes or 0 for s in all_sessions)

    week_focus_min = sum(
        s.duration_minutes or 0 for s in all_sessions
        if s.started_at and s.started_at.date() >= week_start
    )

    # ── 2. Streak ─────────────────────────────────────────────────────────────
    session_dates = list({
        s.started_at.date() for s in all_sessions if s.started_at
    })
    streak = _consecutive_streak(session_dates)

    # ── 3. Tasks ──────────────────────────────────────────────────────────────
    all_tasks: list[Task] = db.query(Task).filter(Task.deleted_at.is_(None)).all()

    tasks_completed_total = sum(1 for t in all_tasks if t.status == TaskStatus.done)
    tasks_completed_week  = sum(
        1 for t in all_tasks
        if t.status == TaskStatus.done
    )   # sem created_at — aproximação total

    # ── 4. Quadrant distribution ──────────────────────────────────────────────
    quad_dist = {"q1": 0, "q2": 0, "q3": 0, "q4": 0}
    for t in all_tasks:
        q = str(t.quadrant.value if hasattr(t.quadrant, "value") else t.quadrant)
        if q in quad_dist:
            quad_dist[q] += 1

    # ── 5. Focus score (% tempo tasks Q1+Q2 vs total) ────────────────────────
    focus_task_ids = {
        str(s.task_id) for s in all_sessions if s.task_id
    }
    q12_minutes = sum(
        s.duration_minutes or 0
        for s in all_sessions
        if s.task_id and str(s.task_id) in focus_task_ids
        and _get_task_quadrant(db, s.task_id) in ("q1", "q2")
    )
    focus_score = round((q12_minutes / total_focus_min * 100) if total_focus_min > 0 else 0.0, 1)

    # ── 6. Projects ───────────────────────────────────────────────────────────
    from app.models import Project
    projects = db.query(Project).all()
    projects_data = []
    today_iso = today.isoformat()
    most_active_name: Optional[str] = None
    most_active_mins = 0

    for proj in projects:
        ptasks = [t for t in all_tasks if str(t.project_id) == str(proj.id)]
        total_min = sum(t.time_spent_minutes or 0 for t in ptasks)
        tasks_total = len(ptasks)
        tasks_done  = sum(1 for t in ptasks if t.status == TaskStatus.done)
        q_by_quad = {"q1": 0, "q2": 0, "q3": 0, "q4": 0}
        overdue = 0
        for t in ptasks:
            q = str(t.quadrant.value if hasattr(t.quadrant, "value") else t.quadrant)
            if q in q_by_quad:
                q_by_quad[q] += 1
            if t.due_date_iso and t.due_date_iso < today_iso and t.status != TaskStatus.done:
                overdue += 1

        completion_rate = round((tasks_done / tasks_total * 100) if tasks_total > 0 else 0.0, 1)

        if total_min > most_active_mins:
            most_active_mins = total_min
            most_active_name = proj.name

        projects_data.append({
            "id":               str(proj.id),
            "name":             proj.name,
            "total_minutes":    total_min,
            "tasks_total":      tasks_total,
            "tasks_done":       tasks_done,
            "tasks_by_quadrant": q_by_quad,
            "completion_rate":  completion_rate,
            "overdue_count":    overdue,
        })

    # ── 7. Daily focus (últimos 14 dias) ──────────────────────────────────────
    daily_map: dict[str, int] = {}
    for s in all_sessions:
        if s.started_at and s.started_at.date() >= since_14:
            d_iso = s.started_at.date().isoformat()
            daily_map[d_iso] = daily_map.get(d_iso, 0) + (s.duration_minutes or 0)

    # Preenche dias sem sessão com 0
    daily_focus = []
    for i in range(14):
        d = (since_14 + timedelta(days=i)).isoformat()
        daily_focus.append({"date": d, "minutes": daily_map.get(d, 0)})

    # Inclui mood do dia (via ProductivitySnapshot)
    snaps_map: dict[str, float | None] = {}
    snaps = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date >= since_14.isoformat(),
        )
        .all()
    )
    for s in snaps:
        snaps_map[s.date] = s.mood_avg

    for entry in daily_focus:
        entry["mood"] = _fmt_mood(snaps_map.get(entry["date"]))

    return {
        "summary": {
            "total_focus_minutes":      total_focus_min,
            "total_focus_minutes_week": week_focus_min,
            "tasks_completed_total":    tasks_completed_total,
            "tasks_completed_week":     tasks_completed_week,
            "focus_score":              focus_score,
            "most_active_project":      most_active_name,
            "current_streak_days":      streak,
        },
        "projects":               projects_data,
        "quadrant_distribution":  quad_dist,
        "daily_focus":            daily_focus,
    }


def _get_task_quadrant(db: Session, task_id: uuid.UUID) -> str:
    """Retorna o quadrante de uma task (cached via ORM identity map)."""
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return "q4"
    q = task.quadrant
    return str(q.value if hasattr(q, "value") else q)


# ── GET /api/analytics/heatmap/{user_id} ─────────────────────────────────────

@router.get("/heatmap/{user_id}")
def get_heatmap(user_id: str, db: Session = Depends(get_db)):
    """Últimos 90 dias de atividade para o heatmap estilo GitHub."""
    today    = date.today()
    since_90 = today - timedelta(days=89)

    # Lê ProductivitySnapshots como fonte primária
    snaps = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date >= since_90.isoformat(),
        )
        .all()
    )
    snap_map = {s.date: s for s in snaps}

    # Complementa com FocusSessions para dias sem snapshot
    sessions = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at != None,              # noqa: E711
            FocusSession.started_at >= datetime.combine(since_90, datetime.min.time()),
        )
        .all()
    )
    sess_map: dict[str, int] = {}
    for s in sessions:
        if s.started_at:
            d_iso = s.started_at.date().isoformat()
            sess_map[d_iso] = sess_map.get(d_iso, 0) + (s.duration_minutes or 0)

    result = []
    for i in range(90):
        d = (since_90 + timedelta(days=i)).isoformat()
        snap = snap_map.get(d)
        result.append({
            "date":             d,
            "minutes":          snap.focus_minutes if snap else sess_map.get(d, 0),
            "tasks_completed":  snap.tasks_completed if snap else 0,
            "mood":             _fmt_mood(snap.mood_avg) if snap else None,
        })

    return result
