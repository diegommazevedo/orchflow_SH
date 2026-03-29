"""
agent/conformity.py

Motor universal de conformidade.
TODA entrada no banco passa por aqui — chat, formulário, upload, voz.
Transforma dado bruto em dado limpo, padronizado, íntegro.
"""

import logging
import re
from datetime import datetime, date, timedelta
from typing import Any
from unidecode import unidecode

logger = logging.getLogger(__name__)


class ConformityError(ValueError):
    """Valor de CustomField não pôde ser conformado."""

    pass


# ── Conformidade de título ─────────────────────────────────
def conform_title(raw: str, assignee: str | None = None, context: str | None = None) -> str:
    """
    Transforma título bruto em título lapidado.
    Formato: [Assignee] · O que fazer · Contexto
    """
    if not raw:
        return ""

    # corrige ortografia básica — remove duplos espaços, trim
    title = re.sub(r'\s+', ' ', raw.strip())

    # capitaliza primeira letra de cada sentença
    title = '. '.join(s.strip().capitalize() for s in title.split('.') if s.strip())

    # remove prefixos de comando que vazaram pro título
    prefixes = r'^(criar?|nova?|novo?|adicionar?|mete|bota|task|tarefa|card)\s+'
    title = re.sub(prefixes, '', title, flags=re.IGNORECASE).strip().capitalize()

    # monta título composto
    parts = []
    if assignee:
        parts.append(f"[{assignee}]")
    parts.append(title)
    if context:
        parts.append(f"· {context}")

    return ' '.join(parts)


# ── Conformidade de nome de pessoa ────────────────────────
def conform_name(raw: str) -> str:
    """
    José da silva → José da Silva
    jose silva    → Jose Silva
    JOSE SILVA    → Jose Silva
    """
    if not raw:
        return ""
    # preposições que ficam minúsculas em nomes
    prepositions = {'da', 'de', 'do', 'das', 'dos', 'e'}
    words = raw.strip().split()
    result = []
    for i, word in enumerate(words):
        if i > 0 and word.lower() in prepositions:
            result.append(word.lower())
        else:
            result.append(word.capitalize())
    return ' '.join(result)


# ── Conformidade de data/prazo ────────────────────────────
def conform_date(raw: str | None) -> dict | None:
    """
    Converte expressões relativas em data absoluta + gap legível.
    Retorna: { iso: "2026-03-23", display: "23/03/2026", gap: "vence em 4h" }
    """
    if not raw:
        return None

    today = date.today()
    now = datetime.now()
    target: date | None = None

    raw_lower = raw.lower().strip()

    # expressões relativas
    relative_map = {
        'hoje': today,
        'hj': today,
        'amanhã': today + timedelta(days=1),
        'amanha': today + timedelta(days=1),
        'amh': today + timedelta(days=1),
        'depois de amanhã': today + timedelta(days=2),
        'semana que vem': today + timedelta(days=7),
        'próxima semana': today + timedelta(days=7),
        'proxima semana': today + timedelta(days=7),
    }

    for expr, resolved in relative_map.items():
        if expr in raw_lower:
            target = resolved
            break

    # tenta parse de data explícita dd/mm/yyyy ou yyyy-mm-dd
    if not target:
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%y'):
            try:
                target = datetime.strptime(raw_lower, fmt).date()
                break
            except ValueError:
                continue

    if not target:
        return None

    # calcula gap
    delta = target - today
    if delta.days == 0:
        # calcula em horas até fim do dia
        end_of_day = datetime.combine(today, datetime.max.time())
        hours_left = int((end_of_day - now).seconds / 3600)
        gap = f"vence em {hours_left}h" if hours_left > 0 else "vence hoje"
    elif delta.days == 1:
        gap = "amanhã"
    elif delta.days == -1:
        gap = "venceu ontem"
    elif delta.days > 1:
        gap = f"em {delta.days} dias"
    else:
        gap = f"venceu há {abs(delta.days)} dias"

    return {
        "iso": target.isoformat(),
        "display": target.strftime('%d/%m/%Y'),
        "gap": gap,
        "overdue": delta.days < 0,
    }


# ── Conformidade de valor monetário ──────────────────────
def conform_currency(raw: str) -> str | None:
    """
    '1500'     → 'R$ 1.500,00'
    '1500.50'  → 'R$ 1.500,50'
    'r$1500'   → 'R$ 1.500,00'
    """
    if not raw:
        return None
    cleaned = re.sub(r'[^\d.,]', '', raw.replace(',', '.'))
    try:
        value = float(cleaned)
        return f"R$ {value:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    except ValueError:
        return None


# ── Conformidade de texto livre (descrição) ───────────────
def conform_description(raw: str) -> str:
    """
    Corrige ortografia básica, formata parágrafos, mantém conteúdo intacto.
    NÃO altera o significado — só a forma.
    """
    if not raw:
        return ""
    # remove duplos espaços e quebras excessivas
    text = re.sub(r'\s+', ' ', raw.strip())
    # capitaliza início de frases
    sentences = re.split(r'(?<=[.!?])\s+', text)
    return ' '.join(s.capitalize() for s in sentences if s)


# ── Dispatcher universal ──────────────────────────────────
FIELD_CONFORMERS = {
    'title':       conform_title,
    'name':        conform_name,
    'description': conform_description,
    'due_date':    conform_date,
    'currency':    conform_currency,
}

def conform_field(field_type: str, value: Any, **kwargs) -> Any:
    """
    Ponto único de entrada para conformidade de qualquer campo.
    Usado pelo chat, formulários e uploads.
    """
    conformer = FIELD_CONFORMERS.get(field_type)
    if not conformer:
        return value
    if field_type == 'title':
        return conformer(value, **kwargs)
    return conformer(value)


def _select_canonical(raw: str, opts: list[str]) -> str:
    s = raw.strip()
    if not opts:
        return s
    for o in opts:
        if o.lower() == s.lower():
            return o
    raise ConformityError(f"Opção inválida para select: {raw!r}")


def conform_custom_field_value(
    field_type: str,
    value: Any,
    options: list | None = None,
    *,
    field_name: str = "",
    field_label: str = "",
) -> Any:
    """
    Conformidade de valor antes de persistir em custom_field_values (V2 / Frente 2).
    Levanta ConformityError quando o valor não pode ser normalizado (number, date, select).
    Retorna valor JSON-serializável.
    """
    ft = (field_type or "text").lower()
    opts = [str(o) for o in (options or [])]

    if value is None and ft not in ("boolean", "multiselect"):
        return None

    if ft == "text":
        if value is None:
            return ""
        s = str(value).strip()
        lab = (field_label or "").lower()
        nm = (field_name or "").lower()
        if nm == "name" or "nome" in lab:
            out = conform_name(s) if s else ""
        else:
            out = conform_description(s) if s else ""
        return out[:5000]

    if ft == "textarea":
        return conform_description(str(value))[:16000] if value is not None else ""

    if ft == "number":
        if value is None or (isinstance(value, str) and not str(value).strip()):
            return None
        try:
            v = float(value)
            return int(v) if v == int(v) else v
        except (TypeError, ValueError) as e:
            raise ConformityError("Número inválido") from e

    if ft == "boolean":
        if value is None or (isinstance(value, str) and not str(value).strip()):
            return None
        if isinstance(value, bool):
            return value
        sl = str(value).strip().lower()
        if sl in ("1", "true", "yes", "sim", "on", "s"):
            return True
        if sl in ("0", "false", "no", "não", "nao", "off", "n"):
            return False
        raise ConformityError("Valor booleano inválido (use sim/não, true/false, 1/0)")

    if ft == "date":
        if not value:
            return None
        if isinstance(value, str):
            r = conform_date(value.strip())
            if not r:
                raise ConformityError("Data inválida ou não reconhecida")
            return r["iso"]
        raise ConformityError("Data deve ser texto (ISO ou expressão relativa)")

    if ft == "currency":
        if not value:
            return None
        return conform_currency(str(value)) or conform_description(str(value))[:64]

    if ft == "url":
        u = str(value or "").strip()
        if not u:
            return None
        if not u.startswith(("http://", "https://")):
            u = "https://" + u
        return u[:2048]

    if ft == "user":
        return conform_name(str(value))[:128] if value else None

    if ft == "select":
        if value is None or (isinstance(value, str) and not str(value).strip()):
            return None
        s = str(value).strip()
        if not opts:
            return s
        return _select_canonical(s, opts)

    if ft == "multiselect":
        raw_list: list[Any]
        if not isinstance(value, list):
            raw_list = [value] if value is not None else []
        else:
            raw_list = list(value)
        if not opts:
            return [str(x) for x in raw_list]
        by_lower = {o.lower(): o for o in opts}
        out: list[str] = []
        for x in raw_list:
            k = str(x).strip().lower()
            if k in by_lower:
                out.append(by_lower[k])
            else:
                logger.info("CustomField multiselect: ignorado valor inválido %r", x)
        return out

    return value


def conform_task_payload(raw: dict) -> dict:
    """
    Recebe payload bruto de uma tarefa e retorna tudo conformado.
    Usado pelo executor antes de salvar no banco.
    """
    return {
        'title':       conform_title(
                           raw.get('title', ''),
                           assignee=raw.get('assignee_name'),
                           context=raw.get('project_name'),
                       ),
        'description': conform_description(raw.get('description', '')),
        'due_date':    conform_date(raw.get('due_date')),
        'quadrant':    raw.get('quadrant', 'q2'),
        'status':      raw.get('status', 'backlog'),
    }
