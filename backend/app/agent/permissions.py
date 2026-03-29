"""
agent/permissions.py
Níveis de risco e confidence threshold por usuário.
"""

from enum import Enum
from pydantic import BaseModel


class RiskLevel(str, Enum):
    LOW      = "low"
    MEDIUM   = "medium"
    HIGH     = "high"
    CRITICAL = "critical"


OPERATION_RISK: dict[str, RiskLevel] = {
    "create_task":        RiskLevel.LOW,
    "update_task_status": RiskLevel.LOW,
    "list_tasks":         RiskLevel.LOW,
    "list_projects":      RiskLevel.LOW,
    "create_project":     RiskLevel.MEDIUM,
    "delete_task":        RiskLevel.HIGH,
    "delete_project":     RiskLevel.CRITICAL,
    "unknown":            RiskLevel.HIGH,
}


class UserProfile(BaseModel):
    user_id: str = "default"
    confidence_threshold: float = 0.85
    auto_execute_count: dict[str, int] = {}
    personal_dict: dict[str, str] = {}
    trust_level: int = 0


def should_auto_execute(action: str, confidence: float, profile: UserProfile) -> bool:
    risk = OPERATION_RISK.get(action, RiskLevel.HIGH)
    if risk in (RiskLevel.CRITICAL, RiskLevel.HIGH):
        return False
    if confidence < profile.confidence_threshold:
        return False
    min_conf = {RiskLevel.LOW: 3, RiskLevel.MEDIUM: 10}
    confirmed = profile.auto_execute_count.get(action, 0)
    return confirmed >= min_conf.get(risk, 999)


def get_wizard_mode(action: str, confidence: float, profile: UserProfile) -> str:
    if should_auto_execute(action, confidence, profile):
        return "silent"
    risk = OPERATION_RISK.get(action, RiskLevel.HIGH)
    if risk == RiskLevel.CRITICAL:
        return "block"
    if risk == RiskLevel.HIGH:
        return "full"
    if risk == RiskLevel.MEDIUM:
        return "full" if confidence < 0.7 else "compact"
    return "compact" if confidence >= 0.6 else "full"


def record_confirmation(action: str, profile: UserProfile) -> UserProfile:
    count = profile.auto_execute_count.get(action, 0)
    profile.auto_execute_count[action] = count + 1
    total = sum(profile.auto_execute_count.values())
    if total >= 50:
        profile.trust_level = 2
    elif total >= 15:
        profile.trust_level = 1
    return profile
