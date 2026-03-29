"""
agent/memory_store.py

Camada de acesso à memória semântica persistente.

Fluxo de busca:
1. Recebe input normalizado
2. Calcula similaridade com memórias existentes (cosseno sobre embeddings JSON)
3. Se score >= threshold → retorna intent da memória (zero token Groq)
4. Se score < threshold → retorna None → chama Groq → salva resultado

Fallback: se pgvector extension não estiver ativa,
usa similaridade por Jaccard sobre tokens (sem embedding real).
"""

import math
from typing import Optional
from sqlalchemy.orm import Session
from app.models.memory import UserSemanticProfile, SemanticMemory
from app.agent.permissions import UserProfile
from datetime import datetime


# ── Similaridade ──────────────────────────────────────────

def _jaccard(a: str, b: str) -> float:
    """Similaridade de Jaccard sobre tokens. Fallback sem embedding real."""
    sa = set(a.lower().split())
    sb = set(b.lower().split())
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def _cosine(v1: list, v2: list) -> float:
    """Similaridade de cosseno entre dois vetores."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    n1  = math.sqrt(sum(a * a for a in v1))
    n2  = math.sqrt(sum(b * b for b in v2))
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (n1 * n2)


def _similarity(input_text: str, memory: SemanticMemory) -> float:
    """
    Calcula similaridade entre input e memória armazenada.
    Usa embedding vetorial se disponível, senão Jaccard.
    """
    emb = memory.embedding
    if emb is not None:
        stored_vec = list(emb) if isinstance(emb, (list, tuple)) else []
        if stored_vec:
            input_vec = _text_to_vector(input_text, len(stored_vec))
            return _cosine(input_vec, stored_vec)
    return _jaccard(input_text, memory.normalized)


def _text_to_vector(text: str, size: int = 64) -> list:
    """
    Vetor bag-of-words simplificado de tamanho fixo.
    Usado como embedding leve sem chamar API externa.
    """
    tokens = text.lower().split()
    vec = [0.0] * size
    for token in tokens:
        idx = hash(token) % size
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


# ── Profile Store ─────────────────────────────────────────

def load_profile(user_id: str, db: Session) -> UserProfile:
    """Carrega perfil do banco. Cria se não existir."""
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if not row:
        row = UserSemanticProfile(user_id=user_id)
        db.add(row)
        db.commit()
        db.refresh(row)

    return UserProfile(
        user_id=user_id,
        confidence_threshold=row.confidence_threshold,
        trust_level=row.trust_level,
        personal_dict=row.personal_dict or {},
        auto_execute_count=row.auto_execute_count or {},
    )


def save_profile(profile: UserProfile, db: Session) -> None:
    """Persiste perfil atualizado no banco."""
    row = db.query(UserSemanticProfile).filter_by(user_id=profile.user_id).first()
    if not row:
        row = UserSemanticProfile(user_id=profile.user_id)
        db.add(row)

    row.confidence_threshold = profile.confidence_threshold
    row.trust_level          = profile.trust_level
    row.personal_dict        = profile.personal_dict
    row.auto_execute_count   = profile.auto_execute_count
    row.updated_at           = datetime.utcnow()
    db.commit()


# ── Memory Search ─────────────────────────────────────────

SIMILARITY_THRESHOLD = 0.72   # acima disso → usa memória local

def search_memory(
    normalized_input: str,
    user_id: str,
    db: Session,
    threshold: float = SIMILARITY_THRESHOLD,
) -> Optional[dict]:
    """
    Busca memória semântica local.
    Retorna dict com action+params se encontrar match acima do threshold.
    Retorna None se não encontrar → deve chamar Groq.
    """
    profile_row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if not profile_row:
        return None

    memories = db.query(SemanticMemory)\
        .filter_by(profile_id=profile_row.id)\
        .order_by(SemanticMemory.hit_count.desc())\
        .limit(50)\
        .all()

    best_score = 0.0
    best_memory = None

    for mem in memories:
        score = _similarity(normalized_input, mem)
        if score > best_score:
            best_score = score
            best_memory = mem

    if best_memory and best_score >= threshold:
        # atualiza hit_count e last_used
        best_memory.hit_count   += 1
        best_memory.last_used_at = datetime.utcnow()
        db.commit()

        return {
            "action":     best_memory.action,
            "params":     best_memory.params_json or {},
            "confidence": min(0.99, best_score + 0.1),  # boost por ser memória confirmada
            "from_memory": True,
            "memory_id":  str(best_memory.id),
        }

    return None


def save_memory(
    raw_input: str,
    normalized: str,
    action: str,
    params: dict,
    confidence: float,
    user_id: str,
    db: Session,
) -> None:
    """
    Salva novo comando confirmado como memória semântica.
    Se já existe entrada similar, incrementa hit_count ao invés de duplicar.
    """
    profile_row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if not profile_row:
        profile_row = UserSemanticProfile(user_id=user_id)
        db.add(profile_row)
        db.commit()
        db.refresh(profile_row)

    # verifica duplicata
    existing = search_memory(normalized, user_id, db, threshold=0.90)
    if existing and existing.get("from_memory"):
        return  # já existe entrada muito similar, não duplica

    # gera embedding leve
    embedding = _text_to_vector(normalized, size=64)

    memory = SemanticMemory(
        profile_id  = profile_row.id,
        raw_input   = raw_input,
        normalized  = normalized,
        action      = action,
        params_json = params,
        confidence  = confidence,
        embedding   = embedding,
    )
    db.add(memory)
    db.commit()


# ── Profile visibility (admin) ────────────────────────────

def set_profile_visibility(user_id: str, is_public: bool, db: Session) -> None:
    row = db.query(UserSemanticProfile).filter_by(user_id=user_id).first()
    if row:
        row.is_public  = is_public
        row.updated_at = datetime.utcnow()
        db.commit()


def get_public_memories(db: Session, limit: int = 100) -> list[SemanticMemory]:
    """Retorna memórias de perfis públicos — base compartilhada para novos usuários."""
    public_profiles = db.query(UserSemanticProfile).filter_by(is_public=True).all()
    ids = [p.id for p in public_profiles]
    if not ids:
        return []
    return db.query(SemanticMemory)\
        .filter(SemanticMemory.profile_id.in_(ids))\
        .order_by(SemanticMemory.hit_count.desc())\
        .limit(limit)\
        .all()
