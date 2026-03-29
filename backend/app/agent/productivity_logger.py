"""
agent/productivity_logger.py

Sprint 5C — Gerador do PRODUCTIVITY_LOG.md por usuário.

Leis respeitadas:
  - Log gerado SOMENTE no servidor — nunca no frontend
  - Dados lidos dos ProductivitySnapshot no banco
  - Arquivo salvo em backend/logs/productivity_{user_id}.md
  - Análise de padrões calculada no backend
  - Zero chamadas ao Groq — análise determinística com os dados do banco
"""
import os
from datetime import datetime, date, timedelta
from pathlib import Path
from collections import defaultdict
from typing import Optional

from sqlalchemy.orm import Session

from app.models.focus import FocusSession, ProductivitySnapshot, FocusMood

# Caminho base para os logs (relativo ao diretório do backend)
LOGS_DIR = Path(__file__).parent.parent.parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_minutes(minutes: int) -> str:
    """Formata minutos em '2h 35m' ou '45m'."""
    h = minutes // 60
    m = minutes % 60
    if h > 0 and m > 0:
        return f"{h}h {m}m"
    if h > 0:
        return f"{h}h"
    return f"{m}m"


def _mood_label(avg: Optional[float]) -> str:
    if avg is None:
        return "—"
    if avg < 0.5:
        return "😤 bloqueado"
    if avg < 1.5:
        return "😐 ok"
    return "🔥 no flow"


def _day_of_week(iso_date: str) -> str:
    try:
        d = date.fromisoformat(iso_date)
        return d.strftime("%A").lower()
    except ValueError:
        return ""


# ── Gerador principal ─────────────────────────────────────────────────────────

def generate_log(user_id: str, db: Session) -> str:
    """
    Gera o PRODUCTIVITY_LOG.md para o usuário.
    Lê últimos 30 dias de snapshots e sessões de foco.
    Salva em backend/logs/productivity_{user_id}.md
    Retorna o conteúdo como string.
    """
    today     = date.today()
    since     = today - timedelta(days=30)
    since_iso = since.isoformat()

    # ── Snapshots dos últimos 30 dias ─────────────────────────────────────
    snapshots: list[ProductivitySnapshot] = (
        db.query(ProductivitySnapshot)
        .filter(
            ProductivitySnapshot.user_id == user_id,
            ProductivitySnapshot.date >= since_iso,
        )
        .order_by(ProductivitySnapshot.date.asc())
        .all()
    )

    # ── Sessões de foco dos últimos 30 dias ───────────────────────────────
    sessions: list[FocusSession] = (
        db.query(FocusSession)
        .filter(
            FocusSession.user_id == user_id,
            FocusSession.ended_at != None,  # noqa: E711
            FocusSession.started_at >= datetime.combine(since, datetime.min.time()),
        )
        .order_by(FocusSession.started_at.asc())
        .all()
    )

    # ── Agregados globais ─────────────────────────────────────────────────
    total_focus_min  = sum(s.focus_minutes for s in snapshots)
    total_tasks_done = sum(s.tasks_completed for s in snapshots)
    total_sessions   = len(sessions)
    session_days     = len(snapshots)

    # Mood predominante
    mood_counts: dict[str, int] = defaultdict(int)
    for sess in sessions:
        if sess.mood:
            mood_counts[str(sess.mood.value if hasattr(sess.mood, "value") else sess.mood)] += 1
    dominant_mood = max(mood_counts, key=lambda k: mood_counts[k]) if mood_counts else None

    # Melhor dia (mais minutos de foco)
    best_snap = max(snapshots, key=lambda s: s.focus_minutes) if snapshots else None

    # ── Análise de padrões de hora ─────────────────────────────────────────
    hour_buckets: dict[str, list[int]] = defaultdict(list)
    for sess in sessions:
        if sess.duration_minutes and sess.duration_minutes > 0:
            h = sess.started_at.hour
            if 5 <= h < 12:
                period = "manhã"
            elif 12 <= h < 18:
                period = "tarde"
            else:
                period = "noite"
            hour_buckets[period].append(sess.duration_minutes)

    period_avgs = {
        k: int(sum(v) / len(v)) for k, v in hour_buckets.items() if v
    }
    best_period = max(period_avgs, key=lambda k: period_avgs[k]) if period_avgs else None

    # Duração ideal (mediana das sessões)
    completed_durations = sorted(
        [s.duration_minutes for s in sessions if s.duration_minutes and s.duration_minutes > 5],
        reverse=True,
    )
    ideal_duration = completed_durations[len(completed_durations) // 2] if completed_durations else None

    # ── Agrupamento por semana ─────────────────────────────────────────────
    weeks: dict[str, dict] = defaultdict(lambda: {"focus": 0, "tasks": 0, "days": 0})
    for snap in snapshots:
        try:
            d = date.fromisoformat(snap.date)
            week_start = d - timedelta(days=d.weekday())
            key = week_start.isoformat()
            weeks[key]["focus"]  += snap.focus_minutes
            weeks[key]["tasks"]  += snap.tasks_completed
            weeks[key]["days"]   += 1
        except ValueError:
            continue

    # ── Constrói o markdown ────────────────────────────────────────────────
    lines: list[str] = []
    ts = datetime.now().strftime("%d/%m/%Y %H:%M")

    lines.append(f"# Produtividade — {user_id}")
    lines.append(f"> Atualizado: {ts}")
    lines.append("")

    # Resumo 30 dias
    lines.append("## Resumo 30 dias")
    lines.append("")
    lines.append(f"- **Total foco:** {_fmt_minutes(total_focus_min)}")
    lines.append(f"- **Tasks concluídas:** {total_tasks_done}")
    lines.append(f"- **Sessões:** {total_sessions}")
    lines.append(f"- **Dias ativos:** {session_days}")
    if dominant_mood:
        lines.append(f"- **Mood predominante:** {_mood_label({'blocked': 0.0, 'ok': 1.0, 'flow': 2.0}.get(dominant_mood, 1.0))}")
    if best_snap:
        lines.append(f"- **Melhor dia:** {best_snap.date} — {_fmt_minutes(best_snap.focus_minutes)}")
    lines.append("")

    # Por semana
    if weeks:
        lines.append("## Por semana")
        lines.append("")
        lines.append("| Semana        | Foco       | Tasks | Dias |")
        lines.append("|---------------|------------|-------|------|")
        for week_start in sorted(weeks.keys(), reverse=True)[:8]:
            w = weeks[week_start]
            try:
                wdate = date.fromisoformat(week_start)
                week_end = wdate + timedelta(days=6)
                label = f"{wdate.strftime('%d/%m')} – {week_end.strftime('%d/%m')}"
            except ValueError:
                label = week_start
            lines.append(
                f"| {label:<13} | {_fmt_minutes(w['focus']):<10} | {w['tasks']:<5} | {w['days']:<4} |"
            )
        lines.append("")

    # Padrões identificados
    lines.append("## Padrões identificados")
    lines.append("")
    if best_period:
        lines.append(f"- **Período mais produtivo:** {best_period} ({_fmt_minutes(period_avgs[best_period])} em média)")
    if ideal_duration:
        lines.append(f"- **Duração ideal identificada:** {ideal_duration}min")
    else:
        lines.append("- **Duração ideal:** dados insuficientes (continue registrando sessões)")
    if total_sessions >= 5:
        avg_per_day = total_focus_min / max(session_days, 1)
        lines.append(f"- **Média diária de foco:** {_fmt_minutes(int(avg_per_day))}")
    lines.append("")

    # Dias recentes (últimos 7)
    recent = [s for s in snapshots if s.date >= (today - timedelta(days=7)).isoformat()]
    if recent:
        lines.append("## Últimos 7 dias")
        lines.append("")
        lines.append("| Data  | Dia        | Foco    | Tasks | Mood |")
        lines.append("|-------|------------|---------|-------|------|")
        for snap in sorted(recent, key=lambda s: s.date, reverse=True):
            dow = _day_of_week(snap.date)
            try:
                display = date.fromisoformat(snap.date).strftime("%d/%m")
            except ValueError:
                display = snap.date
            lines.append(
                f"| {display} | {dow:<10} | {_fmt_minutes(snap.focus_minutes):<7} "
                f"| {snap.tasks_completed:<5} | {_mood_label(snap.mood_avg)} |"
            )
        lines.append("")

    content = "\n".join(lines)

    # ── Salva no disco ─────────────────────────────────────────────────────
    log_path = LOGS_DIR / f"productivity_{user_id}.md"
    try:
        log_path.write_text(content, encoding="utf-8")
    except OSError:
        pass  # se não conseguir salvar, retorna o conteúdo mesmo assim

    return content
