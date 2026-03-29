"""
services/onboarding_service.py — Sprint 8: Onboarding da Organização

Gerencia o wizard de 5 steps de configuração inicial da organização.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.workspace import OrgVocabulary, Workspace


# ── Definição dos steps ───────────────────────────────────────────────────────

ONBOARDING_STEPS = [
    {
        "step": 1,
        "title": "Nome da organização",
        "field": "name",
        "required": True,
        "description": "Como sua organização se chama?",
    },
    {
        "step": 2,
        "title": "Vertical do negócio",
        "field": "vertical",
        "required": True,
        "description": "Em qual segmento sua organização atua?",
        "options": [
            "tech", "legal", "health", "construction",
            "education", "retail", "finance", "other",
        ],
    },
    {
        "step": 3,
        "title": "Missão",
        "field": "mission",
        "required": False,
        "description": "Em uma frase, qual é a missão da sua organização?",
    },
    {
        "step": 4,
        "title": "Vocabulário",
        "field": "vocabulary",
        "required": False,
        "description": "Como sua equipe chama as coisas",
    },
    {
        "step": 5,
        "title": "Template de vertical",
        "field": "template",
        "required": False,
        "description": "Aplicar template pré-configurado para sua vertical",
    },
]

# Sugestões de missão por vertical
MISSION_SUGGESTIONS: dict[str, str] = {
    "tech":         "Construir soluções tecnológicas que simplificam a vida das pessoas.",
    "legal":        "Oferecer assessoria jurídica ágil e transparente aos nossos clientes.",
    "health":       "Promover saúde e bem-estar com cuidado humanizado.",
    "construction": "Edificar espaços com qualidade, prazo e segurança.",
    "education":    "Transformar vidas por meio da educação acessível e de qualidade.",
    "retail":       "Conectar pessoas aos produtos que fazem diferença no cotidiano.",
    "finance":      "Simplificar a gestão financeira de pessoas e empresas.",
    "other":        "Criar valor real para nossos clientes e a sociedade.",
}


def get_onboarding_steps() -> list[dict]:
    """Retorna a lista de steps com definições."""
    return ONBOARDING_STEPS


def get_mission_suggestion(vertical: str) -> str:
    """Retorna sugestão de missão para a vertical."""
    return MISSION_SUGGESTIONS.get(vertical, MISSION_SUGGESTIONS["other"])


def advance_onboarding(
    workspace: Workspace,
    step: int,
    data: dict[str, Any],
    user_id: str,
    db: Session,
) -> Workspace:
    """
    Salva dados do step atual e avança o onboarding_step.

    Step 1: name (obrigatório)
    Step 2: vertical (obrigatório)
    Step 3: mission (opcional)
    Step 4: vocabulary (opcional) — dict com term_*
    Step 5: template aplicação (opcional) — template_slug
    """
    # Step 1 — nome
    if step == 1:
        if data.get("name"):
            workspace.name = data["name"]
        if data.get("legal_name"):
            workspace.legal_name = data["legal_name"]

    # Step 2 — vertical + cor inicial por vertical
    elif step == 2:
        if data.get("vertical"):
            workspace.vertical = data["vertical"]

    # Step 3 — missão
    elif step == 3:
        if "mission" in data:
            workspace.mission = data["mission"]

    # Step 4 — vocabulário
    elif step == 4:
        vocab_data = data.get("vocabulary", {})
        if vocab_data:
            _update_vocabulary(workspace, vocab_data, db)

    # Step 5 — template
    elif step == 5:
        template_slug = data.get("template_slug")
        project_id = data.get("project_id")
        if template_slug and project_id:
            try:
                from app.services.template_service import apply_vertical_template
                apply_vertical_template(
                    project_id=project_id,
                    template_slug=template_slug,
                    user_id=user_id,
                    db=db,
                )
            except Exception:
                pass  # template opcional — não bloqueia onboarding

    # Avança step
    workspace.onboarding_step = max(workspace.onboarding_step or 0, step)

    # ActivityLog
    log = ActivityLog(
        entity_type="workspace",
        entity_id=workspace.id,
        user_id=user_id,
        action="onboarding_step_completed",
        extra_data={"step": step, "field": ONBOARDING_STEPS[step - 1]["field"]},
    )
    db.add(log)
    db.commit()
    db.refresh(workspace)
    return workspace


def complete_onboarding(workspace: Workspace, user_id: str, db: Session) -> Workspace:
    """Marca onboarding como concluído e garante que vocabulário existe."""
    workspace.onboarding_completed = True
    workspace.onboarding_step = 100

    # Garante vocabulário padrão
    if workspace.vocabulary is None:
        _ensure_vocabulary(workspace, db)

    log = ActivityLog(
        entity_type="workspace",
        entity_id=workspace.id,
        user_id=user_id,
        action="onboarding_completed",
        extra_data={"vertical": workspace.vertical},
    )
    db.add(log)
    db.commit()
    db.refresh(workspace)
    return workspace


def reset_onboarding(workspace: Workspace, user_id: str, db: Session) -> Workspace:
    """Reseta onboarding para refazer configuração."""
    workspace.onboarding_completed = False
    workspace.onboarding_step = 0

    log = ActivityLog(
        entity_type="workspace",
        entity_id=workspace.id,
        user_id=user_id,
        action="onboarding_reset",
        extra_data={},
    )
    db.add(log)
    db.commit()
    db.refresh(workspace)
    return workspace


# ── Helpers ───────────────────────────────────────────────────────────────────


def _ensure_vocabulary(workspace: Workspace, db: Session) -> OrgVocabulary:
    vocab = db.query(OrgVocabulary).filter(
        OrgVocabulary.workspace_id == workspace.id
    ).first()
    if not vocab:
        vocab = OrgVocabulary(workspace_id=workspace.id)
        db.add(vocab)
        db.flush()
    return vocab


def _update_vocabulary(workspace: Workspace, data: dict, db: Session) -> None:
    vocab = _ensure_vocabulary(workspace, db)
    for field in ("term_project", "term_task", "term_sprint",
                  "term_backlog", "term_member", "term_client"):
        if field in data and data[field]:
            setattr(vocab, field, data[field])
    vocab.updated_at = datetime.utcnow()
