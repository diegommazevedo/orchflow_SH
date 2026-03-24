"""
sheet_processor.py — Sprint 3F

Converte linhas + mapeamento de colunas em tasks conformadas.
ConformityEngine (conform_task_payload) aplicado em TODOS os campos antes de retornar.
Nenhum dado sai desta função sem passar pela conformidade.
"""

from typing import Any

from app.agent.conformity import conform_task_payload

# ── Tabelas de normalização ────────────────────────────────────────────────────

QUADRANT_MAP: dict[str, str] = {
    "urgente importante": "q1",
    "urgente+importante": "q1",
    "urgente e importante": "q1",
    "q1": "q1",
    "1": "q1",
    "crítico": "q1",
    "critico": "q1",
    "critical": "q1",
    "high": "q1",
    "alta": "q1",
    "importante": "q2",
    "important": "q2",
    "q2": "q2",
    "2": "q2",
    "médio": "q2",
    "medio": "q2",
    "medium": "q2",
    "normal": "q2",
    "urgente": "q3",
    "urgent": "q3",
    "q3": "q3",
    "3": "q3",
    "baixa prioridade": "q4",
    "baixa": "q4",
    "baixo": "q4",
    "low": "q4",
    "descarta": "q4",
    "q4": "q4",
    "4": "q4",
}

STATUS_MAP: dict[str, str] = {
    "backlog": "backlog",
    "a fazer": "backlog",
    "to do": "backlog",
    "todo": "backlog",
    "não iniciado": "backlog",
    "nao iniciado": "backlog",
    "pendente": "backlog",
    "pending": "backlog",
    "open": "backlog",
    "em andamento": "in_progress",
    "in progress": "in_progress",
    "in_progress": "in_progress",
    "doing": "in_progress",
    "wip": "in_progress",
    "em progresso": "in_progress",
    "andamento": "in_progress",
    "concluído": "done",
    "concluido": "done",
    "done": "done",
    "finalizado": "done",
    "fechado": "done",
    "closed": "done",
    "complete": "done",
    "completed": "done",
    "resolvido": "done",
    "resolved": "done",
}


def _cell(row: list[str], headers: list[str], col: str | None) -> str:
    """Extrai valor de uma célula dado nome da coluna."""
    if not col:
        return ""
    try:
        idx = headers.index(col)
        return row[idx] if idx < len(row) else ""
    except ValueError:
        return ""


def _norm_quadrant(raw: str) -> str:
    if not raw:
        return "q2"
    return QUADRANT_MAP.get(raw.strip().lower(), "q2")


def _norm_status(raw: str) -> str:
    if not raw:
        return "backlog"
    return STATUS_MAP.get(raw.strip().lower(), "backlog")


def process_rows(
    rows: list[list[str]],
    headers: list[str],
    mapping: dict[str, Any],
    project_name: str = "",
    defaults: dict[str, str] | None = None,
) -> tuple[list[dict], int]:
    """
    Aplica mapeamento em cada linha e passa por ConformityEngine.

    defaults: dict campo → valor padrão para células vazias (não sobrescreve quem tem valor).
    Retorna (tasks_conformadas, n_ignoradas).
    Linhas sem título são ignoradas.
    """
    if defaults is None:
        defaults = {}

    tasks: list[dict] = []
    skipped = 0

    for row in rows:
        title_raw = _cell(row, headers, mapping.get("title")) or defaults.get("title", "")
        if not title_raw.strip():
            skipped += 1
            continue

        assignee_raw = _cell(row, headers, mapping.get("assignee")) or defaults.get("assignee") or None
        quadrant_raw = _cell(row, headers, mapping.get("quadrant")) or defaults.get("quadrant", "")
        status_raw   = _cell(row, headers, mapping.get("status")) or defaults.get("status", "")
        due_raw      = _cell(row, headers, mapping.get("due_date")) or defaults.get("due_date") or None
        desc_raw     = _cell(row, headers, mapping.get("description")) or defaults.get("description") or None

        conformed = conform_task_payload({
            "title":        title_raw,
            "description":  desc_raw or "",
            "due_date":     due_raw,
            "quadrant":     _norm_quadrant(quadrant_raw),
            "status":       _norm_status(status_raw),
            "assignee_name": assignee_raw,
            "project_name": project_name,
        })

        tasks.append({
            **conformed,
            "assignee_hint": assignee_raw,
        })

    return tasks, skipped
