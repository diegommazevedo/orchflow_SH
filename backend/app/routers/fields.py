"""
V2 — Campos customizados.

Leis: ConformityEngine em name, label e values; ActivityLog em create/delete;
      soft delete em fields.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, computed_field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.task import Task
from app.models.schema import CustomField, CustomFieldValue
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.models.activity import ActivityLog
from app.agent.conformity import (
    ConformityError,
    conform_name,
    conform_description,
    conform_custom_field_value,
)
from app.auth.dependencies import get_current_user, get_current_workspace

router = APIRouter()


def _log_project(db: Session, project_id: uuid.UUID, action: str, user_id: str, metadata: dict) -> None:
    db.add(
        ActivityLog(
            entity_type="project",
            entity_id=project_id,
            user_id=user_id,
            action=action,
            extra_data=metadata,
        )
    )


class FieldCreate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    entity_type: str = "task"
    name: str
    label: str
    field_type: str
    required: bool = False
    options: list = Field(default_factory=list)
    order: int = 0


class FieldPatch(BaseModel):
    label: Optional[str] = None
    required: Optional[bool] = None
    options: Optional[list] = None
    order: Optional[int] = None


class FieldOut(BaseModel):
    id: uuid.UUID
    project_id: Optional[uuid.UUID]
    entity_type: str
    name: str
    label: str
    field_type: str
    required: bool
    options: list
    order: int
    created_at: datetime

    class Config:
        from_attributes = True


class ValueOut(BaseModel):
    id: uuid.UUID
    field_id: uuid.UUID
    entity_id: uuid.UUID
    entity_type: str
    value: Any
    conformed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def conformed_value(self) -> Any:
        v = self.value
        if isinstance(v, dict) and "v" in v:
            return v.get("v")
        return v


class ValueUpsert(BaseModel):
    field_id: uuid.UUID
    entity_id: uuid.UUID
    entity_type: str = "task"
    value: Any = None
    raw_value: Any = None

    def resolved_value(self) -> Any:
        if self.raw_value is not None:
            return self.raw_value
        return self.value


def _active_fields_query(db: Session):
    return db.query(CustomField).filter(CustomField.deleted_at.is_(None))


@router.get("/project/{project_id}", response_model=list[FieldOut])
def list_fields_for_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Campos do projeto + campos globais (project_id null)."""
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    q = (
        _active_fields_query(db)
        .filter(
            (CustomField.project_id == project_id) | (CustomField.project_id.is_(None)),
        )
        .order_by(CustomField.order, CustomField.created_at)
    )
    return q.all()


@router.post("/", response_model=FieldOut)
def create_field(
    body: FieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    if body.project_id:
        p = db.query(Project).filter(Project.id == body.project_id, Project.workspace_id == current_workspace.id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    name = conform_name(body.name.strip().lower().replace(" ", "_"))[:128]
    label = conform_description(body.label.strip())[:256]
    if not name or not label:
        raise HTTPException(status_code=422, detail="name e label são obrigatórios")

    row = CustomField(
        project_id=body.project_id,
        entity_type=body.entity_type[:32],
        name=name,
        label=label,
        field_type=body.field_type[:32],
        required=body.required,
        options=body.options or [],
        order=body.order,
    )
    db.add(row)
    db.flush()
    user_id = str(current_user.id)
    if body.project_id:
        _log_project(
            db,
            body.project_id,
            "field_created",
            user_id,
            {"field_id": str(row.id), "name": name, "label": label},
        )
    db.commit()
    db.refresh(row)
    return row


@router.patch("/{field_id}", response_model=FieldOut)
def patch_field(field_id: uuid.UUID, body: FieldPatch, db: Session = Depends(get_db)):
    f = _active_fields_query(db).filter(CustomField.id == field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    if body.label is not None:
        f.label = conform_description(body.label)[:256]
    if body.required is not None:
        f.required = body.required
    if body.options is not None:
        f.options = body.options
    if body.order is not None:
        f.order = body.order
    db.commit()
    db.refresh(f)
    return f


@router.delete("/{field_id}")
def soft_delete_field(
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    f = _active_fields_query(db).filter(CustomField.id == field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    # Count affected values BEFORE delete
    affected_count = db.query(CustomFieldValue).filter(CustomFieldValue.field_id == field_id).count()
    db.query(CustomFieldValue).filter(CustomFieldValue.field_id == field_id).delete(
        synchronize_session=False
    )
    f.deleted_at = datetime.utcnow()
    if f.project_id:
        p = db.query(Project).filter(Project.id == f.project_id, Project.workspace_id == current_workspace.id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    user_id = str(current_user.id)
    if f.project_id:
        _log_project(
            db,
            f.project_id,
            "field_deleted",
            user_id,
            {"field_id": str(f.id), "name": f.name, "affected_records": affected_count},
        )
    db.commit()
    return {"ok": True}


@router.get("/values/{entity_type}/{entity_id}", response_model=list[ValueOut])
def list_values(
    entity_type: str,
    entity_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    q = (
        db.query(CustomFieldValue)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .filter(
            CustomFieldValue.entity_type == entity_type,
            CustomFieldValue.entity_id == entity_id,
            CustomField.deleted_at.is_(None),
        )
        .order_by(CustomFieldValue.updated_at.desc())
    )
    if entity_type == "task":
        q = q.join(Task, Task.id == CustomFieldValue.entity_id).join(Project, Project.id == Task.project_id).filter(
            Project.workspace_id == current_workspace.id
        )
    return q.all()


def do_upsert_custom_field_value(db: Session, body: ValueUpsert) -> CustomFieldValue:
    f = _active_fields_query(db).filter(CustomField.id == body.field_id).first()
    if not f:
        raise HTTPException(status_code=404, detail="Campo não encontrado")

    raw_in = body.resolved_value()
    try:
        conformed = conform_custom_field_value(
            f.field_type,
            raw_in,
            f.options or [],
            field_name=f.name,
            field_label=f.label,
        )
    except ConformityError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    now = datetime.utcnow()
    payload = conformed if isinstance(conformed, (dict, list)) else {"v": conformed}

    existing = (
        db.query(CustomFieldValue)
        .filter(
            CustomFieldValue.field_id == body.field_id,
            CustomFieldValue.entity_id == body.entity_id,
            CustomFieldValue.entity_type == body.entity_type,
        )
        .first()
    )
    if existing:
        existing.value = payload
        existing.updated_at = now
        existing.conformed_at = now
        db.commit()
        db.refresh(existing)
        return existing

    row = CustomFieldValue(
        field_id=body.field_id,
        entity_id=body.entity_id,
        entity_type=body.entity_type[:32],
        value=payload,
        conformed_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/values/", response_model=ValueOut)
def upsert_value(
    body: ValueUpsert,
    response: Response,
    db: Session = Depends(get_db),
):
    if body.value is None and body.raw_value is None:
        raise HTTPException(status_code=422, detail="value ou raw_value é obrigatório")
    out = do_upsert_custom_field_value(db, body)
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "2026-06-01"
    return out
