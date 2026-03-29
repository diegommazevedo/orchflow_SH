"""Dependências de autenticação/workspace para Sprint 5."""
import os
import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer, OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.services.auth_service import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)
_bearer = HTTPBearer(auto_error=False)


def _disable_auth() -> bool:
    return os.getenv("DISABLE_AUTH", "false").lower() == "true"


def _mock_user(db: Session) -> User:
    user = db.query(User).first()
    if user:
        return user
    user = User(
        name="Dev User",
        email="dev@local",
        password_hash=None,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if _disable_auth():
        return _mock_user(db)
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token de autenticação necessário",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_token(credentials.credentials)
    user = db.query(User).filter(User.id == uuid.UUID(payload["user_id"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inválido ou inativo")
    # Popula state para rate limiting por usuário
    try:
        request.state.user_id = str(user.id)
    except Exception:
        pass
    return user


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Optional[dict]:
    if _disable_auth():
        user = _mock_user(db)
        return {"user_id": str(user.id), "workspace_id": None}
    if not credentials:
        return None
    try:
        payload = decode_token(credentials.credentials)
        return {"user_id": str(payload["user_id"]), "workspace_id": payload.get("workspace_id")}
    except HTTPException:
        return None


async def get_current_workspace(
    current_user: User = Depends(get_current_user),
    x_workspace_id: Optional[str] = Header(None, alias="X-Workspace-Id"),
    db: Session = Depends(get_db),
) -> Workspace:
    if _disable_auth():
        ws = db.query(Workspace).first()
        if ws:
            return ws
        ws = Workspace(name="Workspace Dev", slug="workspace-dev", created_by=current_user.id)
        db.add(ws)
        db.flush()
        db.add(WorkspaceMember(workspace_id=ws.id, user_id=current_user.id, role="admin", invited_by=current_user.id))
        db.commit()
        db.refresh(ws)
        return ws

    if not x_workspace_id:
        raise HTTPException(status_code=400, detail="X-Workspace-Id é obrigatório")
    ws = db.query(Workspace).filter(Workspace.id == uuid.UUID(x_workspace_id)).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == ws.id,
        WorkspaceMember.user_id == current_user.id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Usuário não pertence ao workspace informado")
    return ws


def require_admin(
    current_user: User = Depends(get_current_user),
    current_workspace: Workspace = Depends(get_current_workspace),
    db: Session = Depends(get_db),
) -> None:
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == current_workspace.id,
        WorkspaceMember.user_id == current_user.id,
        WorkspaceMember.role == "admin",
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Ação permitida apenas para admin")


def assert_project_in_workspace(
    project_id: str,
    workspace: Workspace,
    db: Session,
) -> Project:
    project = db.query(Project).filter(
        Project.id == uuid.UUID(project_id),
        Project.workspace_id == workspace.id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return project
