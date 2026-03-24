"""
agent/normalizer.py
Normaliza entrada bruta antes de enviar ao Groq.
"""

import re

BASE_DICT = {
    r"\bq1\b": "quadrante q1 urgente importante",
    r"\bq2\b": "quadrante q2 importante",
    r"\bq3\b": "quadrante q3 urgente",
    r"\bq4\b": "quadrante q4 descartar",
    r"\burgente\b": "quadrante q1",
    r"\bpra hj\b": "quadrante q1 prazo hoje",
    r"\bpra hoje\b": "quadrante q1 prazo hoje",
    r"\bwip\b": "em andamento",
    r"\bfazendo\b": "em andamento",
    r"\bin progress\b": "em andamento",
    r"\bfeito\b": "concluído",
    r"\bpronto\b": "concluído",
    r"\bok\b": "concluído",
    r"\bdone\b": "concluído",
    r"\bna fila\b": "backlog",
    r"\bmete\b": "cria",
    r"\bbota\b": "cria",
    r"\bjoga\b": "move",
    r"\bempurra\b": "move",
    r"\bmanda\b": "move",
    r"\btira\b": "deleta",
    r"\bapaga\b": "deleta",
    r"\bmostra\b": "lista",
    r"\bve\b": "lista",
    r"\bvê\b": "lista",
    r"\btask\b": "tarefa",
    r"\bcard\b": "tarefa",
    r"\bticket\b": "tarefa",
    r"\bproj\b": "projeto",
    r"\baq\b": "aqui",
    r"\btb\b": "também",
    r"\bpq\b": "porque",
    r"\bvc\b": "você",
    r"\bhj\b": "hoje",
    r"\bamh\b": "amanhã",
}

def normalize(text: str, personal_dict: dict | None = None) -> str:
    result = text.lower().strip()
    if personal_dict:
        for pattern, replacement in personal_dict.items():
            result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    for pattern, replacement in BASE_DICT.items():
        result = re.sub(pattern, replacement, result, flags=re.IGNORECASE)
    return result

def extract_assignee_hint(text: str) -> str | None:
    """Extrai menção a pessoa — 'pro zé', 'para o joão', '@maria'"""
    patterns = [
        r'\bpro\s+(\w+)\b',
        r'\bpara\s+o\s+(\w+)\b',
        r'\bpara\s+a\s+(\w+)\b',
        r'\bpara\s+(\w+)\b',
        r'@(\w+)',
    ]
    for p in patterns:
        m = re.search(p, text, re.IGNORECASE)
        if m:
            return m.group(1)
    return None

def extract_personal_abbreviation(raw: str, confirmed_intent: dict) -> dict | None:
    words = raw.lower().split()
    action = confirmed_intent.get("action", "")
    action_keywords = {
        "create_task":        ["cria", "criar", "nova", "novo", "adiciona"],
        "update_task_status": ["move", "mover", "muda", "joga"],
        "delete_task":        ["deleta", "deletar", "remove", "apaga"],
        "list_tasks":         ["lista", "listar", "mostra"],
        "create_project":     ["cria", "criar", "novo"],
        "list_projects":      ["lista", "listar"],
    }
    known = action_keywords.get(action, [])
    for word in words:
        if word not in known and len(word) >= 2:
            replacement = known[0] if known else word
            return {r"\b" + re.escape(word) + r"\b": replacement}
    return None
