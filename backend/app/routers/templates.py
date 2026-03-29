"""
V2 — Templates de vertical.

Lei: ActivityLog template_applied; templates são sugestões — aplicação explícita via API.
POST legado /{slug}/apply/{project_id} deprecado — preferir POST /api/projects/{id}/apply-template.
"""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.template import VerticalTemplate
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.auth.dependencies import get_current_user, get_current_workspace
from app.services.template_service import apply_vertical_template

router = APIRouter()


class TemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: Optional[str]
    is_public: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TemplateDetailOut(TemplateOut):
    custom_fields: list
    kanban_columns: list
    agent_configs: dict


class ApplyTemplateResult(BaseModel):
    columns_added: int
    fields_added: int
    skipped: list[str]


@router.get("/by-id/{template_id}", response_model=TemplateDetailOut)
def get_template_by_id(template_id: uuid.UUID, db: Session = Depends(get_db)):
    t = db.query(VerticalTemplate).filter(VerticalTemplate.id == template_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    return t


@router.get("/", response_model=list[TemplateOut])
def list_templates(db: Session = Depends(get_db)):
    return (
        db.query(VerticalTemplate)
        .filter(VerticalTemplate.is_public.is_(True))
        .order_by(VerticalTemplate.name)
        .all()
    )


@router.get("/{slug}", response_model=TemplateDetailOut)
def get_template(slug: str, db: Session = Depends(get_db)):
    t = db.query(VerticalTemplate).filter(VerticalTemplate.slug == slug).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    return t


@router.post("/{slug}/apply/{project_id}", response_model=ApplyTemplateResult)
def apply_template_legacy(
    slug: str,
    project_id: uuid.UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    t = db.query(VerticalTemplate).filter(VerticalTemplate.slug == slug).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Projeto não encontrado no workspace")
    raw = apply_vertical_template(db, project_id, t, str(current_user.id))
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "2026-06-01"
    return ApplyTemplateResult(
        columns_added=raw["columns_added"],
        fields_added=raw["fields_added"],
        skipped=raw["skipped"],
    )
