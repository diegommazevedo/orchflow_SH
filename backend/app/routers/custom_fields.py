"""
Frente 2 — rotas REST alinhadas ao spec: /api/projects/.../fields e /api/tasks/.../field-values.

Implementação usa tabelas existentes `custom_fields` / `custom_field_values`.
"""

import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field as PydField
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.schema import CustomField, CustomFieldValue
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.auth.dependencies import get_current_user, get_current_workspace
from app.routers.fields import (
    FieldCreate,
    FieldOut,
    FieldPatch,
    ValueUpsert,
    create_field,
    list_fields_for_project,
    patch_field,
    soft_delete_field,
    do_upsert_custom_field_value,
    _active_fields_query,
)

router = APIRouter()


class TaskFieldValueOut(BaseModel):
    field_id: uuid.UUID
    slug: str
    field_type: str
    conformed_value: Any
    conformed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=False)


class TaskFieldWrite(BaseModel):
    field_id: uuid.UUID
    raw_value: Any


class ProjectFieldCreate(BaseModel):
    name: str
    label: str
    field_type: str
    required: bool = False
    options: list = PydField(default_factory=list)
    order: int = 0
    entity_type: str = "task"


def _unwrap_stored(v: Any) -> Any:
    if isinstance(v, dict) and "v" in v:
        return v.get("v")
    return v


def _row_to_task_out(row: CustomFieldValue, field: CustomField) -> TaskFieldValueOut:
    return TaskFieldValueOut(
        field_id=row.field_id,
        slug=field.name,
        field_type=field.field_type,
        conformed_value=_unwrap_stored(row.value),
        conformed_at=row.conformed_at,
    )


def _field_belongs_project(f: CustomField | None, project_id: uuid.UUID) -> bool:
    return f is not None and f.project_id == project_id


@router.get("/projects/{project_id}/fields", response_model=list[FieldOut])
def get_project_fields(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    return list_fields_for_project(project_id, db, current_workspace)


@router.post("/projects/{project_id}/fields", response_model=FieldOut)
def post_project_field(
    project_id: uuid.UUID,
    body: ProjectFieldCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    fc = FieldCreate(
        project_id=project_id,
        entity_type=body.entity_type[:32],
        name=body.name,
        label=body.label,
        field_type=body.field_type,
        required=body.required,
        options=body.options or [],
        order=body.order,
    )
    return create_field(fc, db, current_user, current_workspace)


@router.patch("/projects/{project_id}/fields/{field_id}", response_model=FieldOut)
def patch_project_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    body: FieldPatch,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    f = _active_fields_query(db).filter(CustomField.id == field_id).first()
    if not _field_belongs_project(f, project_id):
        raise HTTPException(status_code=404, detail="Campo não encontrado neste projeto")
    return patch_field(field_id, body, db)


@router.delete("/projects/{project_id}/fields/{field_id}")
def delete_project_field(
    project_id: uuid.UUID,
    field_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    f = _active_fields_query(db).filter(CustomField.id == field_id).first()
    if not _field_belongs_project(f, project_id):
        raise HTTPException(status_code=404, detail="Campo não encontrado neste projeto")
    return soft_delete_field(field_id, db, current_user, current_workspace)


@router.get("/tasks/{task_id}/field-values", response_model=list[TaskFieldValueOut])
def get_task_field_values(
    task_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.id == task_id, Task.deleted_at.is_(None), Project.workspace_id == current_workspace.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    rows = (
        db.query(CustomFieldValue)
        .join(CustomField, CustomField.id == CustomFieldValue.field_id)
        .filter(
            CustomFieldValue.entity_id == task_id,
            CustomFieldValue.entity_type == "task",
            CustomField.deleted_at.is_(None),
        )
        .all()
    )
    out: list[TaskFieldValueOut] = []
    for row in rows:
        fld = db.query(CustomField).filter(CustomField.id == row.field_id).first()
        if fld:
            out.append(_row_to_task_out(row, fld))
    return out


@router.post("/tasks/{task_id}/field-values", response_model=TaskFieldValueOut)
def post_task_field_value(
    task_id: uuid.UUID,
    body: TaskFieldWrite,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    task = (
        db.query(Task)
        .join(Project, Project.id == Task.project_id)
        .filter(Task.id == task_id, Task.deleted_at.is_(None), Project.workspace_id == current_workspace.id)
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada")

    vu = ValueUpsert(
        field_id=body.field_id,
        entity_id=task_id,
        entity_type="task",
        raw_value=body.raw_value,
    )
    row = do_upsert_custom_field_value(db, vu)
    fld = _active_fields_query(db).filter(CustomField.id == body.field_id).first()
    if not fld:
        raise HTTPException(status_code=404, detail="Campo não encontrado")
    return _row_to_task_out(row, fld)
