"""
upload.py — Sprint 3E + Sprint 3F

Sprint 3E:
  POST /contract         — extrai PDF → parse → revisão (sem persistir)
  POST /contract/confirm — aplica ConformityEngine e grava projeto + tarefas

Sprint 3F:
  POST /sheet            — lê .xlsx/.csv → detecta colunas → mapeia via Groq
  POST /sheet/confirm    — aplica ConformityEngine em todas as linhas e grava tasks
"""

import json
import threading
import time
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.database import get_db
from app.models.project import Project
from app.models.task import Task, TaskStatus, EisenhowerQuadrant
from app.models.user import User
from app.agent.doc_extractor import extract_text
from app.agent.contract_parser import parse_contract
from app.agent.backlog_reviewer import review_backlog
from app.agent.sheet_extractor import extract_sheet
from app.agent.sheet_mapper import map_columns
from app.agent.sheet_processor import process_rows
from app.agent.conformity import conform_name, conform_description, conform_task_payload
from app.agent.file_router import detect_and_route

router = APIRouter()

# ── Armazenamento temporário de planilhas (limpo após /confirm ou 30 min) ──────
_SHEET_STORE: dict[str, dict] = {}
_SHEET_EXPIRY: dict[str, float] = {}
_STORE_TTL = 1800  # 30 minutos


def _store_sheet(data: dict) -> str:
    file_id = str(uuid.uuid4())
    _SHEET_STORE[file_id] = data
    _SHEET_EXPIRY[file_id] = time.time() + _STORE_TTL
    _cleanup_expired()
    return file_id


def _get_sheet(file_id: str) -> dict:
    _cleanup_expired()
    if file_id not in _SHEET_STORE:
        raise HTTPException(status_code=404, detail="Sessão de planilha não encontrada ou expirada. Faça upload novamente.")
    return _SHEET_STORE[file_id]


def _drop_sheet(file_id: str) -> None:
    _SHEET_STORE.pop(file_id, None)
    _SHEET_EXPIRY.pop(file_id, None)


def _cleanup_expired() -> None:
    now = time.time()
    expired = [k for k, exp in _SHEET_EXPIRY.items() if now > exp]
    for k in expired:
        _SHEET_STORE.pop(k, None)
        _SHEET_EXPIRY.pop(k, None)


class ConfirmBody(BaseModel):
    project: dict[str, Any]
    tasks: list[dict[str, Any]]
    user_id: str = "default"


def _resolve_assignee(hint: str | None, db: Session) -> tuple[Optional[uuid.UUID], Optional[str]]:
    if not hint:
        return None, None
    user = db.query(User).filter(
        or_(
            User.nickname.ilike(f"%{hint}%"),
            User.name.ilike(f"%{hint}%"),
        )
    ).first()
    if user:
        return user.id, user.name
    return None, hint


@router.post("/contract")
async def upload_contract(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .pdf")

    content = await file.read()
    try:
        text = extract_text(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao ler PDF: {e}")

    try:
        parsed = parse_contract(text)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Falha ao interpretar contrato: {e}")

    tasks_in = parsed.get("tasks") or []
    try:
        reviewed = review_backlog(tasks_in)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Falha na revisão do backlog: {e}")

    return {
        "project": parsed.get("project", {}),
        "tasks": reviewed,
    }


@router.post("/contract/confirm")
def confirm_contract(body: ConfirmBody, db: Session = Depends(get_db)):
    """
    Aplica conformidade em todos os campos antes de persistir.
    Nenhum dado chega ao banco sem passar pelo ConformityEngine (conform_task_payload / conform_name / conform_description).
    """
    p = body.project
    if not p.get("name"):
        raise HTTPException(status_code=400, detail="project.name é obrigatório")

    pname = conform_name(p.get("name", "Projeto"))
    meta = {
        "client": p.get("client"),
        "start_date": p.get("start_date"),
        "end_date": p.get("end_date"),
        "contract_summary": p.get("description", ""),
    }
    desc_text = conform_description(p.get("description", ""))
    desc_stored = json.dumps(
        {**meta, "description": desc_text},
        ensure_ascii=False,
    )

    project = Project(name=pname, description=desc_stored)
    db.add(project)
    db.commit()
    db.refresh(project)

    pid = str(project.id)
    created = 0

    for raw in body.tasks:
        assignee_id, assignee_display = _resolve_assignee(raw.get("assignee_hint"), db)

        conformed = conform_task_payload({
            "title": raw.get("title") or "Tarefa",
            "description": raw.get("description"),
            "due_date": raw.get("due_date"),
            "quadrant": raw.get("quadrant") or "q2",
            "status": "backlog",
            "assignee_name": assignee_display,
            "project_name": pname,
        })

        qval = conformed.get("quadrant", "q2")
        quadrant = EisenhowerQuadrant(qval) if qval in [x.value for x in EisenhowerQuadrant] else EisenhowerQuadrant.q2

        extra = []
        if raw.get("source_clause"):
            extra.append(f"Cláusula: {raw['source_clause']}")
        if raw.get("review_notes"):
            extra.append(f"Revisão: {raw['review_notes']}")
        if raw.get("quadrant_rationale"):
            extra.append(f"Quadrante: {raw['quadrant_rationale']}")
        desc_task = conformed.get("description", "")
        if extra:
            desc_task = (desc_task + "\n\n" if desc_task else "") + "\n".join(extra)

        task = Task(
            title=conformed["title"],
            description=conform_description(desc_task) if desc_task else None,
            status=TaskStatus.backlog,
            quadrant=quadrant,
            project_id=project.id,
            assignee_id=assignee_id,
            due_date_iso=conformed["due_date"]["iso"] if conformed.get("due_date") else None,
        )
        db.add(task)
        created += 1

    db.commit()

    return {
        "project_id": pid,
        "tasks_created": created,
        "message": f"Projeto criado com {created} tarefas.",
    }


# ══ Sprint 3F — planilha / CSV ════════════════════════════════════════════════

SHEET_SAMPLE_PREVIEW = 200  # todas as linhas do buffer retornadas ao wizard


@router.post("/sheet")
async def upload_sheet(file: UploadFile = File(...)):
    """
    Lê .xlsx ou .csv, mapeia colunas via Groq e armazena temporariamente.
    NÃO persiste nada no banco — apenas retorna estrutura para revisão no wizard.
    """
    filename = file.filename or "upload"
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .xlsx ou .csv")

    content = await file.read()

    try:
        sheet = extract_sheet(content, filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao ler planilha: {e}")

    try:
        result = map_columns(sheet["headers"], sheet["rows"])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Falha ao mapear colunas: {e}")

    # Gera preview das primeiras linhas já com mapeamento aplicado
    sample_tasks, _ = process_rows(
        sheet["rows"][:SHEET_SAMPLE_PREVIEW],
        sheet["headers"],
        result["mapping"],
    )

    # Armazena planilha completa para uso no /sheet/confirm
    file_id = _store_sheet({
        "headers": sheet["headers"],
        "rows": sheet["rows"],
        "total_rows": sheet["total_rows"],
        "format": sheet["format"],
    })

    return {
        "file_id": file_id,
        "headers": sheet["headers"],
        "mapping": result["mapping"],
        "confidence": result["confidence"],
        "notes": result["notes"],
        "sample_tasks": sample_tasks,
        "total_rows": sheet["total_rows"],
        "format": sheet["format"],
    }


class SheetConfirmBody(BaseModel):
    file_id: str
    project_id: str
    mapping: dict[str, Any]
    user_id: str = "default"
    defaults: dict[str, str] = {}  # campo → valor padrão para células vazias


@router.post("/sheet/confirm")
def confirm_sheet(body: SheetConfirmBody, db: Session = Depends(get_db)):
    """
    Processa TODAS as linhas da planilha com o mapeamento (possivelmente corrigido pelo usuário).
    Aplica ConformityEngine em cada campo antes de persistir.
    Nenhuma linha vai ao banco sem passar por process_rows + conform_task_payload.
    """
    sheet = _get_sheet(body.file_id)

    # Valida projeto
    project = db.query(Project).filter(Project.id == body.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    if not body.mapping.get("title"):
        raise HTTPException(status_code=400, detail="mapping.title é obrigatório.")

    pname = str(project.name)

    # ConformityEngine aplicado em process_rows (chama conform_task_payload em cada linha)
    tasks, skipped = process_rows(
        sheet["rows"],
        sheet["headers"],
        body.mapping,
        project_name=pname,
        defaults=body.defaults,
    )

    created = 0
    for t in tasks:
        assignee_id, _ = _resolve_assignee(t.get("assignee_hint"), db)

        qval = t.get("quadrant", "q2")
        quadrant = (
            EisenhowerQuadrant(qval)
            if qval in [x.value for x in EisenhowerQuadrant]
            else EisenhowerQuadrant.q2
        )

        status_val = t.get("status", "backlog")
        try:
            status = TaskStatus(status_val)
        except ValueError:
            status = TaskStatus.backlog

        task = Task(
            title=t["title"],
            description=conform_description(t.get("description", "")) or None,
            status=status,
            quadrant=quadrant,
            project_id=project.id,
            assignee_id=assignee_id,
            due_date_iso=t["due_date"]["iso"] if t.get("due_date") else None,
        )
        db.add(task)
        created += 1

    db.commit()
    _drop_sheet(body.file_id)

    return {
        "tasks_created": created,
        "tasks_skipped": skipped,
        "message": f"{created} tarefas importadas para '{pname}'. {skipped} linhas ignoradas.",
    }


# ══ Detecção de tipo de arquivo (zero processamento, zero banco) ══════════════

@router.post("/detect")
async def detect_file(file: UploadFile = File(...)):
    """
    Identifica o tipo de arquivo por magic bytes + extensão + content_type.
    NÃO processa, NÃO salva nada — pura inspeção de metadados.
    Retorna: { file_type, confidence, suggested_action, metadata }
    """
    content = await file.read()
    result = detect_and_route(
        filename=file.filename or "",
        content_type=file.content_type or "",
        file_bytes=content,
    )
    return result
