"""
routers/focus.py

Sprint 5C — Hiperfoco, carga horária real e log de produtividade.

Endpoints:
  POST /api/focus/start                          — inicia sessão
  POST /api/focus/{session_id}/end               — encerra sessão
  GET  /api/focus/active/{user_id}               — sessão ativa
  GET  /api/focus/history/{user_id}              — últimas 30 sessões
  GET  /api/focus/productivity/{user_id}         — snapshots + log md
  POST /api/focus/productivity/{user_id}/snapshot— força snapshot do dia

Leis respeitadas:
  - FocusSession persiste no banco via /start e /end — nunca só no frontend
  - started_at/ended_at são a fonte da verdade de tempo
  - notes → conform_description antes de salvar
  - ActivityLog gerado ao encerrar sessão
  - ProductivitySnapshot criado/atualizado no backend
  - PRODUCTIVITY_LOG.md gerado no servidor, retornado como string
  - CORS mantido em main.py
"""
import uuid
from datetime import datetime, date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.focus import FocusSession, ProductivitySnapshot, FocusMood
from app.models.task import Task, TaskStatus
from app.models.activity import ActivityLog
from app.agent.conformity import conform_description
from app.agent.productivity_logger import generate_log
from app.auth.dependencies import get_current_user_optional

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class StartBody(BaseModel):
    user_id: str = "default"
    task_id: Optional[str] = None
    sprint_id: Optional[str] = None
    is_pomodoro: bool = False
    pomodoro_minutes: int = 25


class EndBody(BaseModel):
    mood: Optional[FocusMood] = None
    notes: Optional[str] = None


class FocusSessionResponse(BaseModel):
    id: str
    user_id: str
    task_id: Optional[str]
    sprint_id: Optional[str]
    started_at: str
    ended_at: Optional[str]
    duration_minutes: Optional[int]
    mood: Optional[str]
    notes: Optional[str]
    is_pomodoro: bool
    pomodoro_minutes: int

    class Config:
        from_attributes = True


class ProductivitySnapshotResponse(BaseModel):
    id: str
    user_id: str
    date: str
    focus_minutes: int
    tasks_completed: int
    tasks_moved: int
    mood_avg: Optional[float]
    velocity_delta: Optional[float]
    notes: Optional[str]

    class Config:
        from_attributes = True


# ── Helper: ActivityLog ───────────────────────────────────────────────────────

def _log(db: Session, entity_type: str, entity_id: uuid.UUID,
         user_id: str, action: str, extra: dict) -> None:
    db.add(ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        action=action,
        extra_data=extra,
    ))


# ── Helper: ProductivitySnapshot ─────────────────────────────────────────────

_MOOD_SCORE = {"blocked": 0.0, "ok": 1.0, "flow": 2.0}


def _update_snapshot(
    db: Session,
    user_id: str,
    today: str,
    duration_minutes: int,
    task_completed: bool,
    mood: Optional[FocusMood],
) -> None:
    """Cria ou atualiza o snapshot do dia atual."""
    snap = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date == today,
        )
        .first()
    )

    mood_score = _MOOD_SCORE.get(mood.value if mood else "", None) if mood else None

    if snap is None:
        snap = ProductivitySnapshot(
            user_id=user_id,
            date=today,
            focus_minutes=duration_minutes,
            tasks_completed=1 if task_completed else 0,
            tasks_moved=0,
            mood_avg=mood_score,
        )
        db.add(snap)
    else:
        snap.focus_minutes += duration_minutes
        if task_completed:
            snap.tasks_completed += 1
        # Atualiza média de mood (média móvel simples baseada em sessões do dia)
        if mood_score is not None:
            if snap.mood_avg is None:
                snap.mood_avg = mood_score
            else:
                snap.mood_avg = round((snap.mood_avg + mood_score) / 2, 2)

    db.flush()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/start")
def start_session(
    body: StartBody,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    """
    Inicia uma nova sessão de foco.
    Retorna o session_id para o frontend armazenar no localStorage.
    """
    # user_id do token se autenticado, fallback para body ('default')
    user_id = auth["user_id"] if auth else body.user_id

    existing = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at == None,  # noqa: E711
        )
        .first()
    )
    if existing:
        return {"session_id": str(existing.id), "already_active": True,
                "started_at": existing.started_at.isoformat()}

    task_id   = uuid.UUID(body.task_id)   if body.task_id   else None
    sprint_id = uuid.UUID(body.sprint_id) if body.sprint_id else None

    session = FocusSession(
        user_id=user_id,
        task_id=task_id,
        sprint_id=sprint_id,
        is_pomodoro=body.is_pomodoro,
        pomodoro_minutes=body.pomodoro_minutes,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    return {
        "session_id":      str(session.id),
        "started_at":      session.started_at.isoformat(),
        "already_active":  False,
    }


@router.post("/{session_id}/end")
def end_session(session_id: str, body: EndBody, db: Session = Depends(get_db)):
    """
    Encerra a sessão de foco.
    Calcula duration_minutes, atualiza task.time_spent_minutes,
    gera ActivityLog e atualiza ProductivitySnapshot.
    """
    try:
        sess_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="session_id inválido")

    session = db.query(FocusSession).filter(FocusSession.id == sess_uuid).first()
    if not session:
        raise HTTPException(status_code=404, detail="Sessão não encontrada")
    if session.ended_at:
        raise HTTPException(status_code=409, detail="Sessão já encerrada")

    now = datetime.utcnow()
    session.ended_at = now

    # Calcula duração real
    elapsed_sec = (now - session.started_at).total_seconds()
    duration_min = max(1, int(elapsed_sec / 60))
    session.duration_minutes = duration_min

    # Aplica ConformityEngine nas notas
    if body.notes:
        session.notes = conform_description(body.notes)
    session.mood = body.mood

    # Atualiza tempo da task vinculada
    task_completed = False
    if session.task_id:
        task = db.query(Task).filter(Task.id == session.task_id).first()
        if task:
            task.time_spent_minutes = (task.time_spent_minutes or 0) + duration_min
            task_completed = task.status == TaskStatus.done

    # Gera ActivityLog
    _log(
        db,
        entity_type="user",
        entity_id=session.id,
        user_id=session.user_id,
        action="focus_ended",
        extra={"duration_minutes": duration_min,
               "mood": body.mood.value if body.mood else None,
               "is_pomodoro": session.is_pomodoro},
    )

    # Atualiza ProductivitySnapshot do dia
    today_iso = date.today().isoformat()
    _update_snapshot(
        db,
        user_id=session.user_id,
        today=today_iso,
        duration_minutes=duration_min,
        task_completed=task_completed,
        mood=body.mood,
    )

    db.commit()
    db.refresh(session)

    return {
        "session_id":      str(session.id),
        "duration_minutes": session.duration_minutes,
        "ended_at":        session.ended_at.isoformat(),
    }


@router.get("/active/{user_id}")
def get_active_session(user_id: str, db: Session = Depends(get_db)):
    """Retorna sessão ativa (ended_at null) se existir."""
    session = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at == None,  # noqa: E711
        )
        .first()
    )
    if not session:
        return {"active": False}

    return {
        "active":           True,
        "session_id":       str(session.id),
        "task_id":          str(session.task_id) if session.task_id else None,
        "sprint_id":        str(session.sprint_id) if session.sprint_id else None,
        "started_at":       session.started_at.isoformat(),
        "is_pomodoro":      session.is_pomodoro,
        "pomodoro_minutes": session.pomodoro_minutes,
    }


@router.get("/history/{user_id}")
def get_history(user_id: str, db: Session = Depends(get_db)):
    """Últimas 30 sessões encerradas do usuário."""
    sessions = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at != None,  # noqa: E711
        )
        .order_by(FocusSession.started_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "session_id":      str(s.id),
            "task_id":         str(s.task_id) if s.task_id else None,
            "started_at":      s.started_at.isoformat(),
            "ended_at":        s.ended_at.isoformat() if s.ended_at else None,
            "duration_minutes": s.duration_minutes,
            "mood":            s.mood.value if s.mood else None,
            "is_pomodoro":     s.is_pomodoro,
        }
        for s in sessions
    ]


@router.get("/productivity/{user_id}")
def get_productivity(user_id: str, db: Session = Depends(get_db)):
    """
    Últimos 30 dias de ProductivitySnapshot + log markdown gerado.
    """
    since_iso = (date.today() - timedelta(days=30)).isoformat()
    snaps = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date >= since_iso,
        )
        .order_by(ProductivitySnapshot.date.desc())
        .all()
    )

    log_md = generate_log(user_id, db)

    return {
        "snapshots": [
            {
                "id":              str(s.id),
                "date":            s.date,
                "focus_minutes":   s.focus_minutes,
                "tasks_completed": s.tasks_completed,
                "tasks_moved":     s.tasks_moved,
                "mood_avg":        s.mood_avg,
                "velocity_delta":  s.velocity_delta,
            }
            for s in snaps
        ],
        "log_md": log_md,
    }


@router.post("/productivity/{user_id}/snapshot")
def force_snapshot(user_id: str, db: Session = Depends(get_db)):
    """Força a geração/atualização do snapshot do dia atual."""
    today_iso = date.today().isoformat()

    snap = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date == today_iso,
        )
        .first()
    )
    if not snap:
        snap = ProductivitySnapshot(
            user_id=user_id,
            date=today_iso,
        )
        db.add(snap)
        db.commit()
        db.refresh(snap)

    log_md = generate_log(user_id, db)
    return {"snapshot": {"date": snap.date, "focus_minutes": snap.focus_minutes},
            "log_md": log_md}
