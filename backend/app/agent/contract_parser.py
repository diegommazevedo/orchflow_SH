"""
contract_parser.py — Sprint 3E

Interpreta texto de contrato → projeto + backlog (JSON via Groq).
"""

import json
import os
import re

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
    key = os.getenv("GROQ_API_KEY")
    if not key or not key.strip():
        raise ValueError("GROQ_API_KEY não configurada no servidor.")
    return Groq(api_key=key)


def _extract_json_object(s: str) -> dict:
    """Parse JSON do modelo: tolera markdown, texto antes/depois e respostas truncadas."""
    s = (s or "").strip()
    if not s:
        raise ValueError(
            "Resposta do modelo vazia. Confirme GROQ_API_KEY no Railway e cota da API Groq."
        )
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```\s*$", "", s).strip()
    s = re.sub(r"```json|```", "", s).strip()

    try:
        data = json.loads(s)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = s.find("{")
    end = s.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(s[start : end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError as e:
            raise ValueError(
                f"JSON inválido na resposta do modelo (trecho extraído). "
                f"Tente outro PDF ou reduza o tamanho. Detalhe: {e}"
            ) from e

    raise ValueError(
        "Não foi possível extrair JSON da resposta do modelo. "
        "O contrato pode ser muito longo ou o modelo retornou só texto."
    )


def parse_contract(text: str) -> dict:
    """
    Interpreta texto de contrato e devolve dict com project + tasks.
    """
    if not text or len(text.strip()) < 20:
        raise ValueError("Texto do contrato insuficiente para análise.")

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
    choice = resp.choices[0].message
    raw = (choice.content or "").strip()
    data = _extract_json_object(raw)

    if "project" not in data or "tasks" not in data:
        raise ValueError("Resposta do modelo sem project/tasks.")

    return data
