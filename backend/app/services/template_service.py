"""
Frente 3 — aplicação de template de vertical ao projeto.

Leis: só adiciona colunas/campos em falta; nunca sobrescreve;
      ActivityLog template_applied com payload completo (obrigatório).
"""

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.template import VerticalTemplate
from app.models.schema import CustomField
from app.models.kanban import KanbanColumn
from app.models.activity import ActivityLog
from app.agent.conformity import conform_name, conform_description


def apply_vertical_template(
    db: Session,
    project_id: uuid.UUID,
    template: VerticalTemplate,
    user_id: str,
) -> dict[str, Any]:
    columns_added = 0
    fields_added = 0
    skipped: list[str] = []

    for cf in template.custom_fields or []:
        nm = conform_name(str(cf.get("name", "")).strip().lower().replace(" ", "_"))[:128]
        if not nm:
            skipped.append("field:(nome vazio)")
            continue
        exists = (
            db.query(CustomField)
            .filter(
                CustomField.project_id == project_id,
                CustomField.name == nm,
                CustomField.deleted_at.is_(None),
            )
            .first()
        )
        if exists:
            skipped.append(f"field:{nm}")
            continue
        label = conform_description(str(cf.get("label", nm)))[:256]
        db.add(
            CustomField(
                project_id=project_id,
                entity_type=str(cf.get("entity_type", "task"))[:32],
                name=nm,
                label=label,
                field_type=str(cf.get("field_type", "text"))[:32],
                required=bool(cf.get("required", False)),
                options=cf.get("options") or [],
                order=int(cf.get("order", 0)),
            )
        )
        fields_added += 1

    existing_slugs = {
        c.slug
        for c in db.query(KanbanColumn).filter(KanbanColumn.project_id == project_id).all()
    }
    for col in template.kanban_columns or []:
        sl = str(col.get("slug", "")).strip().lower().replace(" ", "_")[:64]
        if not sl:
            skipped.append("column:(slug vazio)")
            continue
        if sl in existing_slugs:
            skipped.append(f"column:{sl}")
            continue
        db.add(
            KanbanColumn(
                project_id=project_id,
                name=str(col.get("name", sl))[:128],
                slug=sl,
                color=str(col.get("color", "#4a4a6a"))[:16],
                order=int(col.get("order", 0)),
                is_default=bool(col.get("is_default", False)),
                is_done=bool(col.get("is_done", False)),
            )
        )
        existing_slugs.add(sl)
        columns_added += 1

    db.flush()
    done_n = (
        db.query(KanbanColumn)
        .filter(KanbanColumn.project_id == project_id, KanbanColumn.is_done.is_(True))
        .count()
    )
    if done_n == 0:
        last = (
            db.query(KanbanColumn)
            .filter(KanbanColumn.project_id == project_id)
            .order_by(KanbanColumn.order.desc())
            .first()
        )
        if last:
            last.is_done = True

    db.add(
        ActivityLog(
            entity_type="project",
            entity_id=project_id,
            user_id=user_id,
            action="template_applied",
            extra_data={
                "template_id": str(template.id),
                "template_slug": template.slug,
                "template_name": template.name,
                "columns_added": columns_added,
                "fields_added": fields_added,
                "skipped": skipped,
            },
        )
    )
    db.commit()
    return {
        "columns_added": columns_added,
        "fields_added": fields_added,
        "skipped": skipped,
        "template_id": str(template.id),
        "template_slug": template.slug,
        "template_name": template.name,
    }
