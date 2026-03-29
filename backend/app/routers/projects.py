from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.project import Project, ProjectStatus
from app.models.template import VerticalTemplate
from app.models.user import User
from app.models.workspace import Workspace
from app.models.kanban import KanbanColumn
from app.models.schema import CustomField
from app.models.activity import ActivityLog
from app.agent.conformity import conform_name
from app.v2_seed import ensure_project_kanban_defaults
from app.auth.dependencies import get_current_user, get_current_workspace
from app.routers.templates import ApplyTemplateResult
from app.services.template_service import apply_vertical_template
from pydantic import BaseModel
from typing import Optional
import uuid

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    status: str

    class Config:
        from_attributes = True


@router.get("/", response_model=list[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    return db.query(Project).filter(Project.workspace_id == current_workspace.id).all()


@router.post("/", response_model=ProjectResponse)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    # ConformityEngine obrigatório — nenhum dado ao banco sem conform_name
    conformed_name = conform_name(data.name.strip()) if data.name else data.name
    project = Project(name=conformed_name, description=data.description, workspace_id=current_workspace.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    ensure_project_kanban_defaults(db, project.id)
    return project


class ApplyTemplateBody(BaseModel):
    template_id: uuid.UUID


@router.post("/{project_id}/apply-template", response_model=ApplyTemplateResult)
def apply_template_to_project(
    project_id: uuid.UUID,
    body: ApplyTemplateBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Aplica template após confirmação no frontend (wizard MEDIUM)."""
    project = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    t = db.query(VerticalTemplate).filter(VerticalTemplate.id == body.template_id).first()
    if not t or not t.is_public:
        raise HTTPException(status_code=404, detail="Template não encontrado")
    raw = apply_vertical_template(db, project_id, t, str(current_user.id))
    return ApplyTemplateResult(
        columns_added=raw["columns_added"],
        fields_added=raw["fields_added"],
        skipped=raw["skipped"],
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    project = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    return project


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.patch("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    project = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    if data.name is not None:
        project.name = conform_name(data.name.strip()) if data.name.strip() else project.name
    if data.description is not None:
        project.description = data.description
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    project = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")
    db.delete(project)
    db.commit()
    return {"ok": True}


@router.post("/{project_id}/clone", response_model=ProjectResponse)
def clone_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    source = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Projeto não encontrado")

    new_project = Project(
        name=f"{source.name} (cópia)",
        description=source.description,
        workspace_id=current_workspace.id,
    )
    db.add(new_project)
    db.flush()

    # Clonar kanban_columns
    columns = db.query(KanbanColumn).filter(KanbanColumn.project_id == source.id).order_by(KanbanColumn.order).all()
    for col in columns:
        db.add(KanbanColumn(
            project_id=new_project.id,
            name=col.name,
            slug=col.slug,
            color=col.color,
            order=col.order,
            is_default=col.is_default,
            is_done=col.is_done,
        ))

    # Clonar custom_field_definitions
    fields = db.query(CustomField).filter(CustomField.project_id == source.id, CustomField.deleted_at.is_(None)).all()
    for f in fields:
        db.add(CustomField(
            project_id=new_project.id,
            entity_type=f.entity_type,
            name=f.name,
            label=f.label,
            field_type=f.field_type,
            required=f.required,
            options=f.options,
            order=f.order,
        ))

    # ActivityLog
    db.add(ActivityLog(
        entity_type="project",
        entity_id=new_project.id,
        user_id=str(current_user.id),
        action="project_cloned",
        extra_data={
            "source_project_id": str(source.id),
            "source_name": source.name,
        },
    ))

    db.commit()
    db.refresh(new_project)
    return new_project
