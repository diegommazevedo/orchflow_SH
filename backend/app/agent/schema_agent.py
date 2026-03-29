"""
V2 — SchemaAgent: análise heurística read-only + execução só com accepted_ids explícitos.

Lei: analyze_project_schema não persiste nem faz commit.
Lei: execute_accepted_suggestions só aplica itens cuja id está em accepted_ids (espelho do frontend).
"""
from __future__ import annotations

import re
import uuid
from collections import Counter
from datetime import date, datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.agent.conformity import conform_description, conform_name
from app.models.activity import ActivityLog
from app.models.kanban import KanbanColumn
from app.models.schema import CustomField, CustomFieldValue
from app.models.task import Task
from app.schemas.schema_agent import SchemaSuggestion
from app.v2_seed import ensure_project_kanban_defaults


def _blocked_column_present(cols: list[KanbanColumn]) -> bool:
    keys = ("block", "bloquead", "imped", "stuck", "hold")
    for c in cols:
        s = (c.slug or "").lower()
        n = (c.name or "").lower()
        if any(k in s or k in n for k in keys):
            return True
    return False


def _outdated_task(
    task: Task,
    done_slugs: set[str],
    today_iso: str,
) -> bool:
    if not task.due_date_iso:
        return False
    d = task.due_date_iso[:10]
    if d >= today_iso:
        return False
    st = str(task.status or "")
    return st not in done_slugs


def analyze_project_schema(project_id: uuid.UUID, db: Session) -> list[SchemaSuggestion]:
    """Read-only: nenhum add/commit/flush (nem ensure_kanban, que persiste colunas)."""
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id, Task.deleted_at.is_(None))
        .all()
    )
    cols = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id)
        .order_by(KanbanColumn.order, KanbanColumn.created_at)
        .all()
    )
    if not cols:
        return []

    suggestions: list[SchemaSuggestion] = []

    status_counts: dict[str, int] = {c.slug: 0 for c in cols}
    for t in tasks:
        s = str(t.status) if t.status else ""
        if s in status_counts:
            status_counts[s] += 1

    today_iso = date.today().isoformat()
    done_slugs = {c.slug for c in cols if c.is_done}
    overdue_nd = [t for t in tasks if _outdated_task(t, done_slugs, today_iso)]

    # Colunas vazias → remove_column (HIGH)
    for c in cols:
        if status_counts.get(c.slug, 0) == 0 and not c.is_done:
            suggestions.append(
                SchemaSuggestion(
                    id=str(uuid.uuid4()),
                    type="remove_column",
                    title=f'Remover coluna "{c.name}" (sem tasks)',
                    rationale="Nenhuma task usa este status; a coluna pode ser ruído visual.",
                    payload={"column_id": str(c.id), "slug": c.slug},
                    confidence=0.85,
                    risk="HIGH",
                )
            )

    # Atraso sem coluna de bloqueio → add_column (MEDIUM)
    if overdue_nd and not _blocked_column_present(cols):
        max_ord = max((c.order for c in cols), default=0)
        suggestions.append(
            SchemaSuggestion(
                id=str(uuid.uuid4()),
                type="add_column",
                title='Adicionar coluna "Bloqueado / Impedimento"',
                rationale="Há tasks com prazo vencido fora de colunas concluídas; uma coluna de bloqueio ajuda a visibilizar impedimentos.",
                payload={
                    "name": "Bloqueado",
                    "slug": "bloqueado",
                    "color": "#c0392b",
                    "order": max_ord + 1,
                    "is_default": False,
                    "is_done": False,
                },
                confidence=0.72,
                risk="MEDIUM",
            )
        )

    # Campos sem valores com 7+ tasks (HIGH)
    task_ids = [t.id for t in tasks]
    n_tasks = len(tasks)
    if n_tasks >= 7 and task_ids:
        fields = (
            db.query(CustomField)
            .filter(CustomField.project_id == project_id, CustomField.deleted_at.is_(None))
            .all()
        )
        for f in fields:
            filled = (
                db.query(func.count(CustomFieldValue.id))
                .filter(
                    CustomFieldValue.field_id == f.id,
                    CustomFieldValue.entity_type == "task",
                    CustomFieldValue.entity_id.in_(task_ids),
                )
                .scalar()
                or 0
            )
            if filled == 0:
                suggestions.append(
                    SchemaSuggestion(
                        id=str(uuid.uuid4()),
                        type="remove_field",
                        title=f'Remover campo pouco usado "{f.label}"',
                        rationale=f"Nenhum valor preenchido em {n_tasks} tasks; o campo pode ser legado ou redundante.",
                        payload={"field_id": str(f.id), "name": f.name},
                        confidence=0.7,
                        risk="HIGH",
                    )
                )

    # Padrões textuais → add_field select (MEDIUM)
    texts: list[str] = []
    for t in tasks:
        if t.description:
            texts.append(t.description.lower())
        if t.title:
            texts.append(t.title.lower())
    blob = " ".join(texts)
    urgent_hits = len(re.findall(r"\burgente\b|\burgent\b|\bpriorit[aá]ri", blob))
    if urgent_hits >= 2:
        exists_urg = (
            db.query(CustomField)
            .filter(
                CustomField.project_id == project_id,
                CustomField.name == "urgencia",
                CustomField.deleted_at.is_(None),
            )
            .first()
        )
        if not exists_urg:
            suggestions.append(
                SchemaSuggestion(
                    id=str(uuid.uuid4()),
                    type="add_field",
                    title='Campo select "Urgência"',
                    rationale=f"O termo urgente/prioritário aparece {urgent_hits}× nos textos; um select padroniza a informação.",
                    payload={
                        "name": "urgencia",
                        "label": "Urgência",
                        "field_type": "select",
                        "entity_type": "task",
                        "options": ["Normal", "Alta", "Crítica"],
                        "order": 10,
                    },
                    confidence=min(0.95, 0.55 + urgent_hits * 0.05),
                    risk="MEDIUM",
                )
            )

    clients = re.findall(r"cliente\s+([a-záàâãéêíóôõúç0-9]{2,40})", blob)
    if len(clients) >= 3:
        cnt = Counter(clients)
        top_opts = [w.capitalize() for w, _ in cnt.most_common(8)]
        exists_cli = (
            db.query(CustomField)
            .filter(
                CustomField.project_id == project_id,
                CustomField.name == "cliente_referencia",
                CustomField.deleted_at.is_(None),
            )
            .first()
        )
        if top_opts and not exists_cli:
            suggestions.append(
                SchemaSuggestion(
                    id=str(uuid.uuid4()),
                    type="add_field",
                    title='Campo select "Cliente (referência textual)"',
                    rationale="Há menções repetidas a clientes no texto livre; um select reduz variacao ortográfica.",
                    payload={
                        "name": "cliente_referencia",
                        "label": "Cliente (texto)",
                        "field_type": "select",
                        "entity_type": "task",
                        "options": top_opts,
                        "order": 11,
                    },
                    confidence=0.68,
                    risk="MEDIUM",
                )
            )

    # Done não agrupado no fim → reorder_columns (LOW)
    sorted_cols = sorted(cols, key=lambda c: (c.order, c.created_at or datetime.utcnow()))
    seen_done = False
    messy = False
    for c in sorted_cols:
        if c.is_done:
            seen_done = True
        elif seen_done:
            messy = True
            break
    if messy and len(cols) >= 2:
        non_done = [c for c in sorted_cols if not c.is_done]
        done = [c for c in sorted_cols if c.is_done]
        items = [{"id": str(c.id), "order": i} for i, c in enumerate(non_done + done)]
        suggestions.append(
            SchemaSuggestion(
                id=str(uuid.uuid4()),
                type="reorder_columns",
                title="Reordenar colunas (concluídas por último)",
                rationale="Colunas de conclusão não estão todas ao fim do fluxo; reordenação melhora leitura do board.",
                payload={"items": items},
                confidence=0.62,
                risk="LOW",
            )
        )

    return suggestions


def _log_schema_batch(
    db: Session,
    project_id: uuid.UUID,
    user_id: str,
    accepted_snaps: list[dict[str, Any]],
    rejected_snaps: list[dict[str, Any]],
) -> None:
    db.add(
        ActivityLog(
            entity_type="project",
            entity_id=project_id,
            user_id=user_id,
            action="schema_agent_applied",
            extra_data={
                "accepted": accepted_snaps,
                "rejected": rejected_snaps,
                "project_id": str(project_id),
            },
        )
    )
    db.commit()


def execute_accepted_suggestions(
    project_id: uuid.UUID,
    accepted_ids: list[str],
    all_suggestions: list[SchemaSuggestion],
    user_id: str,
    db: Session,
) -> dict[str, Any]:
    """
    Aplica apenas sugestões cujo id está em accepted_ids.
    rejected = all_suggestions - accepted (para log).
    """
    accepted_set = set(accepted_ids)
    accepted_list = [s for s in all_suggestions if s.id in accepted_set]
    rejected_list = [s for s in all_suggestions if s.id not in accepted_set]

    applied = 0
    skipped_due_to_law = 0
    errors: list[str] = []

    ensure_project_kanban_defaults(db, project_id)

    for s in accepted_list:
        try:
            if s.type == "add_column":
                p = s.payload
                slug = str(p.get("slug", "")).strip().lower().replace(" ", "_")[:64]
                name = str(p.get("name", "")).strip()[:128]
                if not slug or not name:
                    errors.append(f"{s.id}: add_column payload inválido")
                    continue
                if (
                    db.query(KanbanColumn)
                    .filter(KanbanColumn.project_id == project_id, KanbanColumn.slug == slug)
                    .first()
                ):
                    errors.append(f"{s.id}: slug de coluna já existe")
                    continue
                col = KanbanColumn(
                    project_id=project_id,
                    name=name,
                    slug=slug,
                    color=str(p.get("color", "#4a4a6a"))[:16],
                    order=int(p.get("order", 0)),
                    is_default=bool(p.get("is_default", False)),
                    is_done=bool(p.get("is_done", False)),
                )
                db.add(col)
                db.flush()
                done_n = (
                    db.query(KanbanColumn)
                    .filter(KanbanColumn.project_id == project_id, KanbanColumn.is_done.is_(True))
                    .count()
                )
                if done_n == 0:
                    col.is_done = True
                db.commit()
                db.refresh(col)
                applied += 1

            elif s.type == "remove_column":
                cid = uuid.UUID(str(s.payload["column_id"]))
                col = (
                    db.query(KanbanColumn)
                    .filter(KanbanColumn.id == cid, KanbanColumn.project_id == project_id)
                    .first()
                )
                if not col:
                    errors.append(f"{s.id}: coluna não encontrada")
                    continue
                if col.is_done:
                    others = (
                        db.query(KanbanColumn)
                        .filter(
                            KanbanColumn.project_id == project_id,
                            KanbanColumn.id != col.id,
                            KanbanColumn.is_done.is_(True),
                        )
                        .count()
                    )
                    if others == 0:
                        skipped_due_to_law += 1
                        continue
                db.delete(col)
                db.commit()
                applied += 1

            elif s.type == "add_field":
                p = s.payload
                raw_name = str(p.get("name", "")).strip().lower().replace(" ", "_")
                name = conform_name(raw_name)[:128]
                label = conform_description(str(p.get("label", name)))[:256]
                if not name or not label:
                    errors.append(f"{s.id}: campo name/label inválido")
                    continue
                row = CustomField(
                    project_id=project_id,
                    entity_type=str(p.get("entity_type", "task"))[:32],
                    name=name,
                    label=label,
                    field_type=str(p.get("field_type", "text"))[:32],
                    required=False,
                    options=p.get("options") or [],
                    order=int(p.get("order", 0)),
                )
                db.add(row)
                db.commit()
                db.refresh(row)
                applied += 1

            elif s.type == "remove_field":
                fid = uuid.UUID(str(s.payload["field_id"]))
                f = (
                    db.query(CustomField)
                    .filter(
                        CustomField.id == fid,
                        CustomField.project_id == project_id,
                        CustomField.deleted_at.is_(None),
                    )
                    .first()
                )
                if not f:
                    errors.append(f"{s.id}: campo não encontrado")
                    continue
                db.query(CustomFieldValue).filter(CustomFieldValue.field_id == fid).delete(
                    synchronize_session=False
                )
                f.deleted_at = datetime.utcnow()
                db.commit()
                applied += 1

            elif s.type == "reorder_columns":
                items = s.payload.get("items") or []
                for it in items:
                    c_id = uuid.UUID(str(it["id"]))
                    c = (
                        db.query(KanbanColumn)
                        .filter(KanbanColumn.id == c_id, KanbanColumn.project_id == project_id)
                        .first()
                    )
                    if c:
                        c.order = int(it.get("order", c.order))
                db.commit()
                applied += 1

            else:
                errors.append(f"{s.id}: tipo desconhecido {s.type}")

        except Exception as ex:  # noqa: BLE001
            db.rollback()
            errors.append(f"{s.id}: {ex!s}")

    accepted_snaps = [{"id": x.id, "type": x.type} for x in accepted_list]
    rejected_snaps = [{"id": x.id, "type": x.type} for x in rejected_list]
    _log_schema_batch(db, project_id, user_id, accepted_snaps, rejected_snaps)

    return {"applied": applied, "skipped_due_to_law": skipped_due_to_law, "errors": errors}


def propose_vertical(project_id: uuid.UUID, db: Session) -> str:
    """Heurística de vertical (read-only)."""
    tasks = (
        db.query(Task)
        .filter(Task.project_id == project_id, Task.deleted_at.is_(None))
        .all()
    )
    blob = " ".join((t.title or "") + " " + (t.description or "") for t in tasks).lower()
    best_slug = "software_house"
    best_score = -1
    keywords = {
        "software_house": ["bug", "deploy", "sprint", "feature", "code", "api"],
        "advocacia": ["processo", "audiência", "petição", "prazo", "tribunal", "advogado"],
        "clinica": ["consulta", "exame", "paciente", "convênio", "retorno", "médico"],
        "construtora": ["obra", "medição", "fornecedor", "etapa", "canteiro", "engenheiro"],
    }
    for slug, words in keywords.items():
        score = sum(1 for w in words if w in blob)
        if score > best_score:
            best_score = score
            best_slug = slug
    if best_score <= 0 and tasks:
        return "software_house"
    return best_slug


class SchemaAgent:
    """Compat: Agents legados que instanciam SchemaAgent."""

    def analyze_project(self, project_id: uuid.UUID, db: Session) -> list[dict[str, Any]]:
        out = analyze_project_schema(project_id, db)
        return [x.model_dump(mode="json") for x in out]

    def propose_vertical(self, project_id: uuid.UUID, db: Session) -> str:
        return propose_vertical(project_id, db)

    def apply_suggestion(
        self,
        project_id: uuid.UUID,
        suggestion: dict[str, Any],
        db: Session,
    ) -> dict[str, Any]:
        sid = suggestion.get("id") or str(uuid.uuid4())
        stype = suggestion.get("type") or suggestion.get("kind")
        mapping = {
            "add_custom_field": "add_field",
            "remove_unused_column": "remove_column",
            "add_field": "add_field",
            "remove_column": "remove_column",
            "add_column": "add_column",
            "remove_field": "remove_field",
            "reorder_columns": "reorder_columns",
        }
        mapped = mapping.get(str(stype), str(stype))
        body = {
            "id": str(sid),
            "type": mapped,
            "title": suggestion.get("title", ""),
            "rationale": suggestion.get("rationale") or suggestion.get("description", ""),
            "payload": suggestion.get("payload") or {},
            "confidence": float(suggestion.get("confidence", 0.8)),
            "risk": suggestion.get("risk") or ("HIGH" if mapped in ("remove_column", "remove_field") else "MEDIUM"),
        }
        sug = SchemaSuggestion.model_validate(body)
        return execute_accepted_suggestions(project_id, [sug.id], [sug], "default", db)
