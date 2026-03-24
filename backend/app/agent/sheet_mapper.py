"""
sheet_mapper.py — Sprint 3F

Usa Groq para mapear colunas desconhecidas → campos OrchFlow.
Chama o modelo UMA vez com todos os headers + amostra, não coluna por coluna.
"""

import json
import os
import re

from groq import Groq

SYSTEM = """Você é um mapeador de colunas de planilha para campos de um sistema de gestão de tarefas.

Analise os cabeçalhos e linhas de exemplo e retorne JSON indicando qual coluna corresponde a cada campo.

Campos disponíveis:
- title       → título/nome da tarefa (OBRIGATÓRIO — escolha a melhor coluna se não for óbvio)
- description → descrição, detalhes, notas, observações
- quadrant    → prioridade, urgência, quadrante Eisenhower, importância
- status      → estado (backlog, em andamento, concluído, etc.)
- due_date    → prazo, data de entrega, vencimento, deadline
- assignee    → responsável, dono, pessoa atribuída

Retorne APENAS JSON válido, sem markdown:
{
  "mapping": {
    "title":       "nome exato da coluna ou null",
    "description": "nome exato da coluna ou null",
    "quadrant":    "nome exato da coluna ou null",
    "status":      "nome exato da coluna ou null",
    "due_date":    "nome exato da coluna ou null",
    "assignee":    "nome exato da coluna ou null"
  },
  "confidence": 0.0,
  "notes": "observações sobre o mapeamento em português"
}

Regras:
- Cada coluna só pode ser mapeada para UM campo (sem duplicatas).
- title é obrigatório — se nenhuma coluna for óbvia, escolha a melhor candidata.
- Se uma coluna não corresponde a nenhum campo, ignore-a (não coloque em nenhum campo).
- confidence: 1.0 = mapeamento óbvio, 0.7 = razoável, 0.4 = incerto.
"""


def _get_client() -> Groq:
    return Groq(api_key=os.getenv("GROQ_API_KEY"))


def map_columns(headers: list[str], sample_rows: list) -> dict:
    """
    Infere mapeamento de colunas → campos OrchFlow via Groq.

    Retorna:
    {
        "mapping": { "title": "col", "description": null, ... },
        "confidence": 0.85,
        "notes": "observações"
    }

    Levanta ValueError se o campo 'title' não puder ser mapeado.
    """
    if not headers:
        raise ValueError("Nenhum cabeçalho encontrado na planilha.")

    lines = [
        "Cabeçalhos da planilha:",
        ", ".join(f'"{h}"' for h in headers),
        "",
    ]

    if sample_rows:
        lines.append("Linhas de exemplo:")
        for i, row in enumerate(sample_rows[:3], 1):
            pairs = [
                f"{h}: {v}"
                for h, v in zip(headers, row)
                if str(v).strip()
            ]
            lines.append(f"  Linha {i}: {' | '.join(pairs)}")

    prompt = "\n".join(lines)

    client = _get_client()
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": prompt},
        ],
        temperature=0.05,
        max_tokens=512,
    )
    raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"```json|```", "", raw).strip()

    data = json.loads(raw)
    mapping: dict = data.get("mapping", {})

    if not mapping.get("title"):
        raise ValueError(
            "Não foi possível identificar a coluna de título. "
            "Certifique-se de que a planilha tem uma coluna com o nome da tarefa."
        )

    # Garante que as colunas mapeadas existem de fato nos headers
    header_set = set(headers)
    cleaned: dict = {}
    used_cols: set[str] = set()
    for field in ("title", "description", "quadrant", "status", "due_date", "assignee"):
        col = mapping.get(field)
        if col and col in header_set and col not in used_cols:
            cleaned[field] = col
            used_cols.add(col)
        else:
            cleaned[field] = None

    return {
        "mapping": cleaned,
        "confidence": float(data.get("confidence", 0.5)),
        "notes": str(data.get("notes", "")),
    }
