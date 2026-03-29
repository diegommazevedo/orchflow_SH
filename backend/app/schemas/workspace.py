"""
schemas/workspace.py — Sprint 8: Organização como entidade

Schemas Pydantic para workspaces com identidade organizacional.
"""
from __future__ import annotations

from typing import Optional
from pydantic import BaseModel


class OrgVocabularyOut(BaseModel):
    term_project: str = "Projeto"
    term_task:    str = "Tarefa"
    term_sprint:  str = "Sprint"
    term_backlog: str = "Backlog"
    term_member:  str = "Membro"
    term_client:  str = "Cliente"

    class Config:
        from_attributes = True


class OrgVocabularyUpdate(BaseModel):
    term_project: Optional[str] = None
    term_task:    Optional[str] = None
    term_sprint:  Optional[str] = None
    term_backlog: Optional[str] = None
    term_member:  Optional[str] = None
    term_client:  Optional[str] = None


class WorkspaceUpdate(BaseModel):
    name:          Optional[str] = None
    legal_name:    Optional[str] = None
    vertical:      Optional[str] = None
    mission:       Optional[str] = None
    logo_url:      Optional[str] = None
    primary_color: Optional[str] = None
    timezone:      Optional[str] = None
    locale:        Optional[str] = None
    industry:      Optional[str] = None
    size_range:    Optional[str] = None


class WorkspaceOut(BaseModel):
    id:   str
    name: str
    slug: str

    # identidade organizacional
    legal_name:           Optional[str]  = None
    vertical:             Optional[str]  = None
    mission:              Optional[str]  = None
    logo_url:             Optional[str]  = None
    primary_color:        Optional[str]  = "#89b4fa"
    timezone:             Optional[str]  = "America/Sao_Paulo"
    locale:               Optional[str]  = "pt-BR"
    industry:             Optional[str]  = None
    size_range:           Optional[str]  = None
    onboarding_completed: bool           = False
    onboarding_step:      int            = 0

    vocabulary: Optional[OrgVocabularyOut] = None

    class Config:
        from_attributes = True
