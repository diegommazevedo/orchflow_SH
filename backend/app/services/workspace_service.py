
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.workspace import Workspace, WorkspaceInvite, WorkspaceMember


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug[:100] or "workspace"


def create_workspace(name: str, user_id: str, db: Session) -> Workspace:
    base = _slugify(name)
    slug = base
    i = 2
    while db.query(Workspace).filter(Workspace.slug == slug).first():
        slug = f"{base}-{i}"
        i += 1

    ws = Workspace(name=name.strip()[:200], slug=slug, created_by=uuid.UUID(user_id))
    db.add(ws)
    db.flush()
    db.add(
        WorkspaceMember(
            workspace_id=ws.id,
            user_id=uuid.UUID(user_id),
            role="admin",
            invited_by=uuid.UUID(user_id),
        )
    )
    db.commit()
    db.refresh(ws)
    return ws


def _hash_invite_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def invite_member(workspace_id: str, email: str, role: str, invited_by: str, db: Session) -> tuple:
    """Cria convite. Armazena hash do token no banco; retorna (invite, raw_token)."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(raw_token)
    inv = WorkspaceInvite(
        workspace_id=uuid.UUID(workspace_id),
        email=email.strip().lower(),
        role="admin" if role == "admin" else "member",
        token=token_hash,
        invited_by=uuid.UUID(invited_by),
        expires_at=datetime.utcnow() + timedelta(days=7),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    # Stub de envio de email: loga apenas email (nunca o token)
    print(f"[workspace-invite] email={inv.email} convite criado")  # noqa: T201
    return inv, raw_token


def accept_invite(token: str, user_id: str, db: Session) -> WorkspaceMember:
    token_hash = _hash_invite_token(token)
    inv = db.query(WorkspaceInvite).filter(WorkspaceInvite.token == token_hash).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Convite não encontrado")
    if inv.accepted_at is not None:
        raise HTTPException(status_code=400, detail="Convite já aceito")
    if inv.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Convite expirado")

    existing = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == inv.workspace_id,
        WorkspaceMember.user_id == uuid.UUID(user_id),
    ).first()
    if existing:
        inv.accepted_at = datetime.utcnow()
        db.commit()
        return existing

    member = WorkspaceMember(
        workspace_id=inv.workspace_id,
        user_id=uuid.UUID(user_id),
        role=inv.role,
        invited_by=inv.invited_by,
    )
    inv.accepted_at = datetime.utcnow()
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


def list_members(workspace_id: str, db: Session) -> list[WorkspaceMember]:
    return db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == uuid.UUID(workspace_id)).all()


def remove_member(workspace_id: str, user_id: str, db: Session) -> None:
    row = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
        WorkspaceMember.user_id == uuid.UUID(user_id),
    ).first()
    if not row:
        return

    if row.role == "admin":
        admins = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == uuid.UUID(workspace_id),
            WorkspaceMember.role == "admin",
        ).count()
        if admins <= 1:
            raise HTTPException(status_code=400, detail="Não é permitido remover o último admin")
    db.delete(row)
    db.commit()
