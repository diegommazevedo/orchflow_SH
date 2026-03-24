"""
agent/intent_engine.py — Sprint 3C

Pipeline completo:
1. Extrai assignee_hint
2. Normaliza entrada
3. Busca memória local (pgvector/Jaccard) → se encontrar, retorna sem chamar Groq
4. Se não encontrar → chama Groq
5. Aplica conformidade
6. Determina wizard_mode
"""

import os
import json
import re
from typing import Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agent.normalizer import normalize, extract_assignee_hint
from app.agent.permissions import UserProfile, get_wizard_mode
from app.agent.conformity import conform_title, conform_date

# Groq lazy — não instancia na importação
_groq_client = None

def _get_groq():
    global _groq_client
    if _groq_client is None:
        from groq import Groq
        _groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    return _groq_client


SYSTEM_PROMPT = """
Você é o motor de intenção do OrchFlow, sistema de gestão de projetos.
Recebe português brasileiro informal — gírias, abreviações, erros, linguagem tosca.
Devolve dados LIMPOS, PADRONIZADOS e PROFISSIONAIS.

REGRAS:
1. Sempre infira o máximo. Campo vazio é falha sua.
2. Título = verbo + objeto. Ex: "Revisar schema do banco de dados"
3. NUNCA inclua nomes de pessoas no título — vai no campo assignee_hint
4. Urgência/prazo hoje → quadrante q1
5. Retorne APENAS JSON válido, sem markdown

Operações: create_task, update_task_status, delete_task, list_tasks,
           create_project, list_projects, unknown

Status: backlog, in_progress, done
Quadrantes: q1=urgente+importante, q2=importante, q3=urgente, q4=descartar

JSON:
{
  "action": "operacao",
  "confidence": 0.0-1.0,
  "params": {
    "title": "verbo + objeto SEM nome de pessoa",
    "description": "contexto adicional ou null",
    "quadrant": "q1|q2|q3|q4 ou null",
    "status": "backlog|in_progress|done ou null",
    "task_name_hint": "fragmento para buscar tarefa existente ou null",
    "due_date": "hoje|amanhã|data explícita ou null",
    "assignee_hint": "nome/apelido da pessoa mencionada ou null"
  },
  "missing_fields": [],
  "human_summary": "1 frase explicando o que foi entendido",
  "inference_notes": "por que inferiu quadrante/prazo/etc"
}
"""


class IntentParams(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    quadrant: Optional[str] = None
    status: Optional[str] = None
    task_name_hint: Optional[str] = None
    due_date: Optional[str] = None
    assignee_hint: Optional[str] = None


class IntentResult(BaseModel):
    action: str
    confidence: float
    params: IntentParams
    missing_fields: list[str]
    human_summary: str
    inference_notes: str = ""
    raw_message: str
    normalized_message: str = ""
    wizard_mode: str = "full"
    conformed_title: Optional[str] = None
    conformed_due_date: Optional[dict] = None
    from_memory: bool = False    # indica se veio da memória local


def parse_intent(
    message: str,
    profile: UserProfile | None = None,
    db: Session | None = None,
) -> IntentResult:
    """
    1. Normaliza
    2. Busca memória local (se db disponível)
    3. Chama Groq apenas se necessário
    """
    if profile is None:
        profile = UserProfile()

    assignee_hint = extract_assignee_hint(message)
    normalized    = normalize(message, profile.personal_dict)

    # ── Busca memória local primeiro ──────────────────────
    if db is not None:
        from app.agent.memory_store import search_memory
        cached = search_memory(normalized, profile.user_id, db)
        if cached:
            params_raw = cached.get("params", {})
            # injeta assignee do input atual (pode ser diferente do memorizado)
            if assignee_hint and not params_raw.get("assignee_hint"):
                params_raw["assignee_hint"] = assignee_hint

            params     = IntentParams(**params_raw)
            action     = cached["action"]
            confidence = cached["confidence"]

            conformed_title = conform_title(params.title or "") if params.title else None
            conformed_due   = conform_date(params.due_date) if params.due_date else None
            wizard_mode     = get_wizard_mode(action, confidence, profile)

            return IntentResult(
                action=action,
                confidence=confidence,
                params=params,
                missing_fields=[],
                human_summary=f"(memória) {message}",
                inference_notes="recuperado da memória local — sem chamada à API",
                raw_message=message,
                normalized_message=normalized,
                wizard_mode=wizard_mode,
                conformed_title=conformed_title,
                conformed_due_date=conformed_due,
                from_memory=True,
            )

    # ── Chama Groq ────────────────────────────────────────
    try:
        groq = _get_groq()
        response = groq.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": normalized}
            ],
            temperature=0.1,
            max_tokens=600,
        )

        raw  = response.choices[0].message.content.strip()
        raw  = re.sub(r"```json|```", "", raw).strip()
        data = json.loads(raw)

        action     = data.get("action", "unknown")
        confidence = float(data.get("confidence", 0.5))
        params_raw = data.get("params", {})

        if not params_raw.get("assignee_hint") and assignee_hint:
            params_raw["assignee_hint"] = assignee_hint

        params          = IntentParams(**params_raw)
        conformed_title = conform_title(params.title or "") if params.title else None
        conformed_due   = conform_date(params.due_date) if params.due_date else None
        wizard_mode     = get_wizard_mode(action, confidence, profile)

        return IntentResult(
            action=action,
            confidence=confidence,
            params=params,
            missing_fields=data.get("missing_fields", []),
            human_summary=data.get("human_summary", message),
            inference_notes=data.get("inference_notes", ""),
            raw_message=message,
            normalized_message=normalized,
            wizard_mode=wizard_mode,
            conformed_title=conformed_title,
            conformed_due_date=conformed_due,
            from_memory=False,
        )

    except Exception:
        return IntentResult(
            action="unknown",
            confidence=0.0,
            params=IntentParams(assignee_hint=assignee_hint),
            missing_fields=[],
            human_summary=f"Não consegui interpretar: {message}",
            raw_message=message,
            normalized_message=normalized,
            wizard_mode="full",
        )
