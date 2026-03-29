"""
services/ai_router.py — Sprint 7.5: AI Token Manager

Núcleo do orquestrador de IA do OrchFlow.
Toda chamada a modelos de linguagem passa por aqui.

Regras:
- Saldo negativo nunca permitido → HTTP 402
- Debit + log são atômicos: rollback se log falhar
- API keys nunca expostas ao frontend
- Uso logado mesmo se motor falhar (cost=0, context="error")
"""

import json
import logging
import os
import re
import uuid
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.ai_engine import AIEngine, AIUsageLog, AIWallet, AIWalletTransaction

logger = logging.getLogger(__name__)


# ── Tipos ────────────────────────────────────────────────────────────────────


@dataclass
class AIResponse:
    text: str
    input_tokens: int
    output_tokens: int
    engine_slug: str = ""


class InsufficientCreditsError(HTTPException):
    def __init__(self, detail: str = "Saldo insuficiente. Recarregue créditos para continuar."):
        super().__init__(status_code=402, detail=detail)


# ── Wallet ───────────────────────────────────────────────────────────────────


def get_or_create_wallet(workspace_id: str, db: Session) -> AIWallet:
    """Retorna carteira existente ou cria nova com saldo 0."""
    ws_uuid = uuid.UUID(workspace_id)
    wallet = db.query(AIWallet).filter(AIWallet.workspace_id == ws_uuid).first()
    if not wallet:
        wallet = AIWallet(workspace_id=ws_uuid, balance_usd=Decimal("0"), total_spent_usd=Decimal("0"))
        db.add(wallet)
        db.flush()
    return wallet


# ── Seleção de motor ─────────────────────────────────────────────────────────

# Prioridade de seleção por capability (slug preferido → fallback)
_CAPABILITY_PREFERENCE: dict[str, list[str]] = {
    "transcription": ["groq-whisper"],
    "vision":        ["openai-gpt4o"],
    "reasoning":     ["anthropic-claude-sonnet", "openai-gpt4o", "groq-llama-70b"],
    "analysis":      ["anthropic-claude-sonnet", "groq-llama-70b"],
    "chat":          ["groq-llama-70b", "anthropic-claude-sonnet", "openai-gpt4o"],
    "intent":        ["groq-llama-70b"],
    "classification":["groq-llama-70b"],
}
_FALLBACK_SLUG = "groq-llama-70b"


def select_engine(capability: str, db: Session) -> AIEngine:
    """Seleciona motor ativo mais adequado para a capability."""
    preferred = _CAPABILITY_PREFERENCE.get(capability, [_FALLBACK_SLUG])
    for slug in preferred:
        engine = db.query(AIEngine).filter(
            AIEngine.slug == slug,
            AIEngine.is_active == True,  # noqa: E712
        ).first()
        if engine:
            return engine
    # fallback final
    fallback = db.query(AIEngine).filter(
        AIEngine.slug == _FALLBACK_SLUG,
        AIEngine.is_active == True,  # noqa: E712
    ).first()
    if fallback:
        return fallback
    raise HTTPException(status_code=503, detail="Nenhum motor de IA disponível.")


# ── Chamada ao motor ─────────────────────────────────────────────────────────


def _call_groq(engine: AIEngine, prompt: str, context: str) -> AIResponse:
    """Chama Groq API usando o cliente SDK."""
    import groq as groq_sdk
    client = groq_sdk.Groq(api_key=os.getenv("GROQ_API_KEY", ""))
    response = client.chat.completions.create(
        model=engine.model_id,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=1024,
    )
    choice = response.choices[0]
    text = choice.message.content or ""
    usage = response.usage
    return AIResponse(
        text=text,
        input_tokens=usage.prompt_tokens if usage else 0,
        output_tokens=usage.completion_tokens if usage else 0,
        engine_slug=engine.slug,
    )


def _call_openai(engine: AIEngine, prompt: str, context: str) -> AIResponse:
    """Chama OpenAI API via httpx."""
    import httpx
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY não configurada.")
    payload = {
        "model": engine.model_id,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "max_tokens": 1024,
    }
    with httpx.Client(timeout=60) as client:
        r = client.post(
            "https://api.openai.com/v1/chat/completions",
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
    r.raise_for_status()
    data = r.json()
    text = data["choices"][0]["message"]["content"] or ""
    usage = data.get("usage", {})
    return AIResponse(
        text=text,
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
        engine_slug=engine.slug,
    )


def _call_anthropic(engine: AIEngine, prompt: str, context: str) -> AIResponse:
    """Chama Anthropic API via httpx."""
    import httpx
    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY não configurada.")
    payload = {
        "model": engine.model_id,
        "max_tokens": 1024,
        "messages": [{"role": "user", "content": prompt}],
    }
    with httpx.Client(timeout=60) as client:
        r = client.post(
            "https://api.anthropic.com/v1/messages",
            json=payload,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
        )
    r.raise_for_status()
    data = r.json()
    text = data["content"][0]["text"] if data.get("content") else ""
    usage = data.get("usage", {})
    return AIResponse(
        text=text,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        engine_slug=engine.slug,
    )


def call_engine(engine: AIEngine, prompt: str, context: str) -> AIResponse:
    """Dispatcher por provider."""
    if engine.provider == "groq":
        return _call_groq(engine, prompt, context)
    elif engine.provider == "openai":
        return _call_openai(engine, prompt, context)
    elif engine.provider == "anthropic":
        return _call_anthropic(engine, prompt, context)
    else:
        raise HTTPException(status_code=503, detail=f"Provider desconhecido: {engine.provider}")


# ── Custo e débito ───────────────────────────────────────────────────────────


def calculate_cost(engine: AIEngine, input_tokens: int, output_tokens: int) -> Decimal:
    """Custo real baseado no uso do motor."""
    input_cost  = (Decimal(str(input_tokens))  / 1000) * engine.cost_per_1k_input_tokens
    output_cost = (Decimal(str(output_tokens)) / 1000) * engine.cost_per_1k_output_tokens
    return input_cost + output_cost


def debit_wallet(wallet: AIWallet, cost: Decimal, db: Session) -> None:
    """Debita custo da carteira e registra transação."""
    wallet.balance_usd     = (wallet.balance_usd or Decimal("0")) - cost
    wallet.total_spent_usd = (wallet.total_spent_usd or Decimal("0")) + cost
    tx = AIWalletTransaction(
        wallet_id=wallet.id,
        amount_usd=-cost,
        type="debit",
        description="Uso de IA",
    )
    db.add(tx)


def log_usage(
    workspace_id: str,
    engine_id: uuid.UUID,
    agent_name: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: Decimal,
    context: str,
    db: Session,
    user_id: Optional[str] = None,
    task_id: Optional[str] = None,
) -> None:
    """Registra uso de IA no log."""
    entry = AIUsageLog(
        workspace_id=uuid.UUID(workspace_id),
        user_id=uuid.UUID(user_id) if user_id else None,
        engine_id=engine_id,
        task_id=uuid.UUID(task_id) if task_id else None,
        agent_name=agent_name,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=cost_usd,
        context=context,
    )
    db.add(entry)


def check_balance_alert(wallet: AIWallet, db: Session) -> None:
    """Loga alerta quando saldo cai abaixo do threshold."""
    if (
        wallet.alert_threshold_usd is not None
        and wallet.balance_usd <= wallet.alert_threshold_usd
    ):
        logger.warning(
            "AI_WALLET_ALERT workspace=%s balance=%.4f threshold=%.4f",
            wallet.workspace_id,
            float(wallet.balance_usd),
            float(wallet.alert_threshold_usd),
        )


# ── Rota principal ────────────────────────────────────────────────────────────


def route_request(
    workspace_id: str,
    capability: str,
    prompt: str,
    context: str,
    agent_name: str,
    db: Session,
    task_id: Optional[str] = None,
    user_id: Optional[str] = None,
) -> AIResponse:
    """
    Ponto central de todas as chamadas de IA.

    1. Verifica saldo (HTTP 402 se insuficiente)
    2. Seleciona motor por capability + custo
    3. Chama o motor
    4. Calcula custo real
    5. Debit + log atômicos (rollback se log falhar)
    6. Verifica alerta de saldo

    Loga mesmo se o motor falhar (cost=0, context="error").
    """
    wallet = get_or_create_wallet(workspace_id, db)

    # Lei: saldo negativo nunca permitido
    if (wallet.balance_usd or Decimal("0")) <= Decimal("0"):
        raise InsufficientCreditsError()

    engine = select_engine(capability, db)

    # Chama o motor — loga erro mas não bloqueia auditoria
    motor_error: Optional[Exception] = None
    response: Optional[AIResponse] = None
    try:
        response = call_engine(engine, prompt, context)
    except Exception as exc:
        motor_error = exc
        response = AIResponse(text="", input_tokens=0, output_tokens=0, engine_slug=engine.slug)

    cost = calculate_cost(
        engine,
        response.input_tokens,
        response.output_tokens,
    ) if motor_error is None else Decimal("0")

    log_ctx = "error" if motor_error else context

    # Debit + log atômicos
    try:
        if motor_error is None and cost > Decimal("0"):
            debit_wallet(wallet, cost, db)
        log_usage(
            workspace_id=workspace_id,
            engine_id=engine.id,
            agent_name=agent_name,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cost_usd=cost,
            context=log_ctx,
            db=db,
            user_id=user_id,
            task_id=task_id,
        )
        db.commit()
    except Exception as log_exc:
        logger.error("ai_router: falha ao registrar uso — %s", log_exc)
        db.rollback()

    check_balance_alert(wallet, db)

    if motor_error is not None:
        raise motor_error  # tipo: re-raise para o chamador

    return response


# ── Utilitário para transcrição (Whisper) ────────────────────────────────────


def log_transcription_usage(
    workspace_id: str,
    audio_mb: float,
    db: Session,
    user_id: Optional[str] = None,
) -> None:
    """
    Registra uso do Whisper a partir do tamanho do áudio.
    Custo estimado: ~$0.0002 / MB (equivalente a ~1 min de áudio).
    """
    try:
        wallet = get_or_create_wallet(workspace_id, db)
        engine = db.query(AIEngine).filter(AIEngine.slug == "groq-whisper").first()
        if not engine:
            return

        # Estimativa: 1 MB ≈ 1 min ≈ ~150 tokens de input equivalente
        est_tokens = int(audio_mb * 150)
        cost = (Decimal(str(est_tokens)) / 1000) * engine.cost_per_1k_input_tokens

        if (wallet.balance_usd or Decimal("0")) > Decimal("0") and cost > Decimal("0"):
            debit_wallet(wallet, cost, db)

        log_usage(
            workspace_id=workspace_id,
            engine_id=engine.id,
            agent_name="VoiceTranscriber",
            input_tokens=est_tokens,
            output_tokens=0,
            cost_usd=cost,
            context="transcription",
            db=db,
            user_id=user_id,
        )
        db.commit()
    except Exception as exc:
        logger.warning("log_transcription_usage falhou: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
