"""
contract_parser.py — Sprint 3E

Interpreta texto de contrato → projeto + backlog (JSON via Groq).
"""

import json
import os
import re
from typing import Optional

from groq import Groq

SYSTEM = """Você extrai estrutura de contrato em português.

Retorne APENAS JSON válido, sem markdown.

Schema obrigatório:
{
  "project": {
    "name": "nome curto do projeto ou objeto",
    "client": "nome do cliente/contratante ou null",
    "start_date": "YYYY-MM-DD ou null",
    "end_date": "YYYY-MM-DD ou null",
    "description": "resumo do objeto do contrato em 1-3 frases"
  },
  "tasks": [
    {
      "title": "Verbo no infinitivo + objeto (SEM nome de pessoa no título)",
      "description": "detalhe da entrega ou cláusula",
      "quadrant": "q1|q2|q3|q4",
      "due_date": "YYYY-MM-DD ou null se não houver prazo explícito",
      "assignee_hint": "papel ou nome se mencionado, senão null",
      "source_clause": "ex: 3.2 ou Anexo I"
    }
  ]
}

Regras:
- Pelo menos 3 tarefas se o contrato tiver entregas/obrigações identificáveis; senão o mínimo possível.
- Quadrante: q1 urgente+importante, q2 importante, q3 urgente, q4 baixa prioridade.
- Nome de pessoa NUNCA no campo title — use assignee_hint.
"""


def _get_client() -> Groq:
    return Groq(api_key=os.getenv("GROQ_API_KEY"))


def parse_contract(text: str, workspace_id: Optional[str] = None, db=None) -> dict:
    """
    Interpreta texto de contrato e devolve dict com project + tasks.
    """
    if not text or len(text.strip()) < 20:
        raise ValueError("Texto do contrato insuficiente para análise.")

    full_prompt = SYSTEM + "\n\nContrato:\n" + text[:120_000]

    if workspace_id and db is not None:
        from app.services.ai_router import route_request
        ai_resp = route_request(
            workspace_id=workspace_id,
            capability="reasoning",
            prompt=full_prompt,
            context="contract_parser",
            agent_name="ContractParser",
            db=db,
        )
        raw = ai_resp.text
    else:
        client = _get_client()
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": text[:120_000]},
            ],
            temperature=0.15,
            max_tokens=4096,
        )
        raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"```json|```", "", raw).strip()
    data = json.loads(raw)

    if "project" not in data or "tasks" not in data:
        raise ValueError("Resposta do modelo sem project/tasks.")

    return data
