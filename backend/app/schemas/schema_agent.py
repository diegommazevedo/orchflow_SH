"""Pydantic — SchemaAgent (Frente 4 V2)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


SuggestionType = Literal["add_column", "remove_column", "add_field", "remove_field", "reorder_columns"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]


class SchemaSuggestion(BaseModel):
    id: str
    type: SuggestionType
    title: str
    rationale: str
    payload: dict[str, Any] = Field(default_factory=dict)
    confidence: float = Field(ge=0.0, le=1.0)
    risk: RiskLevel


class SchemaAnalysisResult(BaseModel):
    project_id: UUID
    suggestions: list[SchemaSuggestion]
    analyzed_at: datetime


class SchemaApplyRequest(BaseModel):
    accepted_ids: list[str]
    all_suggestions: list[SchemaSuggestion]


class SchemaApplyResult(BaseModel):
    applied: int
    skipped_due_to_law: int
    errors: list[str]
