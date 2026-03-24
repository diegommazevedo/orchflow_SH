"""
routers/agent.py — Sprint 3C

Novidades:
- Perfil carregado/salvo no banco (não mais em memória)
- Memória semântica salva após cada confirmação
- /memory/stats — estatísticas de uso de memória por usuário
- /admin/profiles — lista perfis (admin)
- /admin/profile/{uid}/visibility — torna perfil público/privado
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, Any

from app.database import get_db
from app.agent.intent_engine import parse_intent, IntentResult
from app.agent.executor import execute_intent
from app.agent.permissions import record_confirmation
from app.agent.normalizer import extract_personal_abbreviation, normalize
from app.agent.conformity import conform_field
from app.agent.memory_store import (
    load_profile, save_profile, save_memory,
    set_profile_visibility,
)
from app.models.memory import UserSemanticProfile, SemanticMemory
from app.auth.dependencies import get_current_user_optional

router = APIRouter()


# ── Request models ─────────────────────────────────────────
class InterpretRequest(BaseModel):
    message: str
    project_id: Optional[str] = None
    user_id: str = "default"

class ExecuteRequest(BaseModel):
    intent: dict
    project_id: str
    user_id: str = "default"

class ConformFieldRequest(BaseModel):
    field_type: str
    value: Any
    context: Optional[dict] = None

class ProfilePatch(BaseModel):
    confidence_threshold: Optional[float] = None
    personal_dict: Optional[dict[str, str]] = None
    personal_dict_remove: list[str] = []  # chaves a remover do dicionário pessoal

class VisibilityPatch(BaseModel):
    is_public: bool


# ── Agent endpoints ────────────────────────────────────────
@router.post("/interpret")
def interpret(
    req: InterpretRequest,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="Mensagem vazia")

    # Se autenticado, usa user_id do token; fallback para body ('default')
    user_id = auth["user_id"] if auth else req.user_id

    profile = load_profile(user_id, db)
    result  = parse_intent(req.message, profile, db=db)

    data = result.model_dump()
    data["from_memory"] = result.from_memory
    return data


@router.post("/execute")
def execute(
    req: ExecuteRequest,
    db: Session = Depends(get_db),
    auth: Optional[dict] = Depends(get_current_user_optional),
):
    if not req.project_id:
        raise HTTPException(status_code=400, detail="project_id obrigatório")

    try:
        intent = IntentResult(**req.intent)
    except Exception:
        raise HTTPException(status_code=422, detail="Intent inválido")

    user_id = auth["user_id"] if auth else req.user_id
    result  = execute_intent(intent, req.project_id, db)

    if result.get("success"):
        profile = load_profile(user_id, db)

        # registra confirmação → aumenta confiança futura
        record_confirmation(intent.action, profile)

        # aprende abreviações novas
        candidate = extract_personal_abbreviation(
            intent.raw_message, {"action": intent.action}
        )
        if candidate:
            profile.personal_dict.update(candidate)

        # persiste perfil atualizado no banco
        save_profile(profile, db)

        # salva memória semântica se não veio da memória local
        if not intent.from_memory:
            save_memory(
                raw_input  = intent.raw_message,
                normalized = intent.normalized_message or normalize(intent.raw_message, profile.personal_dict),
                action     = intent.action,
                params     = intent.params.model_dump(exclude_none=True),
                confidence = intent.confidence,
                user_id    = user_id,   # token > body > 'default'
                db         = db,
            )

    return result


@router.post("/conform-field")
def conform_field_endpoint(req: ConformFieldRequest):
    ctx    = req.context or {}
    result = conform_field(req.field_type, req.value, **ctx)
    return {"original": req.value, "conformed": result}


# ── Profile endpoints ──────────────────────────────────────
@router.get("/profile/{user_id}")
def get_user_profile(user_id: str, db: Session = Depends(get_db)):
    profile = load_profile(user_id, db)
    # busca stats de memória
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    memory_count = db.query(SemanticMemory).filter_by(
        profile_id=row.id
    ).count() if row else 0

    data = profile.model_dump()
    data["memory_count"] = memory_count
    data["is_public"]    = row.is_public if row else False
    return data


@router.patch("/profile/{user_id}")
def patch_profile(user_id: str, patch: ProfilePatch, db: Session = Depends(get_db)):
    profile = load_profile(user_id, db)
    if patch.confidence_threshold is not None:
        profile.confidence_threshold = max(0.5, min(1.0, patch.confidence_threshold))
    if patch.personal_dict is not None:
        profile.personal_dict.update(patch.personal_dict)
    for key in patch.personal_dict_remove:
        profile.personal_dict.pop(key, None)
    save_profile(profile, db)
    return profile.model_dump()


# ── Memory stats ───────────────────────────────────────────
@router.get("/memory/stats/{user_id}")
def memory_stats(user_id: str, db: Session = Depends(get_db)):
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if not row:
        return {"memory_count": 0, "top_actions": {}, "total_hits": 0}

    memories = db.query(SemanticMemory).filter_by(profile_id=row.id).all()

    action_counts: dict = {}
    total_hits = 0
    for m in memories:
        action_counts[m.action] = action_counts.get(m.action, 0) + 1
        total_hits += m.hit_count

    return {
        "memory_count": len(memories),
        "top_actions":  action_counts,
        "total_hits":   total_hits,
        "trust_level":  row.trust_level,
        "personal_dict_size": len(row.personal_dict or {}),
    }


# ── Admin endpoints ────────────────────────────────────────
@router.get("/admin/profiles")
def list_profiles(db: Session = Depends(get_db)):
    rows = db.query(UserSemanticProfile).all()
    return [
        {
            "user_id":    r.user_id,
            "trust_level": r.trust_level,
            "is_public":  r.is_public,
            "memory_count": db.query(SemanticMemory).filter_by(profile_id=r.id).count(),
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.patch("/admin/profile/{user_id}/visibility")
def set_visibility(user_id: str, patch: VisibilityPatch, db: Session = Depends(get_db)):
    set_profile_visibility(user_id, patch.is_public, db)
    return {"user_id": user_id, "is_public": patch.is_public}
