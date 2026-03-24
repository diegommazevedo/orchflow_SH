"""
backlog_reviewer.py — Sprint 3E

Segunda passagem (retokenização): analisa o backlog inteiro de uma vez via Groq.
"""

import json
import os
import re

from groq import Groq

SYSTEM = """Você revisa um backlog de tarefas extraído de contrato.

Recebe JSON com lista "tasks". Para CADA tarefa, enriqueça com:
- "review_notes": observações do revisor (consistência, vago, risco) — string, pode ser vazia
- "suggested_subtasks": lista de strings com subtarefas sugeridas se a tarefa for grande ou vaga; [] se não aplicável
- "quadrant": revalide q1|q2|q3|q4 com coerência global
- "quadrant_rationale": uma frase justificando o quadrante

Mantenha title, description, due_date, assignee_hint, source_clause do input (ajuste só se óbvio erro).

Retorne APENAS JSON:
{ "tasks": [ { ...campos originais..., "review_notes": "", "suggested_subtasks": [], "quadrant": "q2", "quadrant_rationale": "" } ] }
"""


def _get_client() -> Groq:
    return Groq(api_key=os.getenv("GROQ_API_KEY"))


def review_backlog(tasks: list[dict]) -> list[dict]:
    """
    Analisa o backlog completo (uma chamada ao modelo).
    """
    if not tasks:
        return []

    client = _get_client()
    payload = json.dumps({"tasks": tasks}, ensure_ascii=False)
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": payload[:100_000]},
        ],
        temperature=0.2,
        max_tokens=4096,
    )
    raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"```json|```", "", raw).strip()
    data = json.loads(raw)
    out = data.get("tasks", tasks)
    if not isinstance(out, list):
        return tasks
    return out
