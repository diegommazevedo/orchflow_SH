"""Router V2.3 — SchemaAgent com wizard HIGH obrigatório."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.agent.schema_agent import analyze_project_schema, execute_accepted_suggestions
from app.auth.dependencies import get_current_user, get_current_workspace
from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.schema_agent import (
    SchemaAnalysisResult,
    SchemaApplyRequest,
    SchemaApplyResult,
)

router = APIRouter()


@router.get("/projects/{project_id}/schema-analysis", response_model=SchemaAnalysisResult)
def schema_analysis(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Read-only: nunca escreve no banco."""
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        return SchemaAnalysisResult(project_id=project_id, suggestions=[], analyzed_at=datetime.utcnow())
    suggestions = analyze_project_schema(project_id, db)
    return SchemaAnalysisResult(
        project_id=project_id,
        suggestions=suggestions,
        analyzed_at=datetime.utcnow(),
    )


@router.post("/projects/{project_id}/schema-apply", response_model=SchemaApplyResult)
def schema_apply(
    project_id: uuid.UUID,
    body: SchemaApplyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
):
    """Aplica apenas IDs aceitos explicitamente pelo frontend."""
    p = db.query(Project).filter(Project.id == project_id, Project.workspace_id == current_workspace.id).first()
    if not p:
        return SchemaApplyResult(applied=0, skipped_due_to_law=0, errors=["Projeto não pertence ao workspace"])
    out = execute_accepted_suggestions(
        project_id=project_id,
        accepted_ids=body.accepted_ids,
        all_suggestions=body.all_suggestions,
        user_id=str(current_user.id),
        db=db,
    )
    return SchemaApplyResult(**out)
