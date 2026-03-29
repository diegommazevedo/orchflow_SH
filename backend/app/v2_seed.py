"""V2 — dados iniciais: templates de vertical e colunas Kanban padrão."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.template import VerticalTemplate
from app.models.kanban import KanbanColumn
from app.models.project import Project

DEFAULT_KANBAN_COLUMNS = [
    {"name": "Backlog", "slug": "backlog", "color": "#4a4a6a", "order": 0, "is_default": True, "is_done": False},
    {"name": "Em andamento", "slug": "in_progress", "color": "#7c6df0", "order": 1, "is_default": False, "is_done": False},
    {"name": "Impedimento", "slug": "blocked", "color": "#f43f5e", "order": 2, "is_default": False, "is_done": False},
    {"name": "Concluído", "slug": "done", "color": "#5eead4", "order": 3, "is_default": False, "is_done": True},
]

VERTICAL_TEMPLATES: list[dict] = [
    {
        "name": "Software house",
        "slug": "software_house",
        "description": "Sprints, bugs, features e deploy.",
        "custom_fields": [
            {"name": "tipo_item", "label": "Tipo", "field_type": "select", "required": False,
             "options": ["Sprint", "Bug", "Feature", "Deploy"], "order": 0},
        ],
        "kanban_columns": [
            {"name": "Backlog", "slug": "backlog", "color": "#4a4a6a", "order": 0, "is_default": True, "is_done": False},
            {"name": "Em desenvolvimento", "slug": "in_progress", "color": "#7c6df0", "order": 1, "is_default": False, "is_done": False},
            {"name": "Code review", "slug": "review", "color": "#f59e0b", "order": 2, "is_default": False, "is_done": False},
            {"name": "Concluído", "slug": "done", "color": "#5eead4", "order": 3, "is_default": False, "is_done": True},
        ],
        "agent_configs": {},
    },
    {
        "name": "Advocacia",
        "slug": "advocacia",
        "description": "Processos, prazos, audiências e petições.",
        "custom_fields": [
            {"name": "numero_processo", "label": "Processo nº", "field_type": "text", "required": False, "options": [], "order": 0},
            {"name": "tipo_peca", "label": "Tipo de peça", "field_type": "select", "required": False,
             "options": ["Processo", "Prazo", "Audiência", "Petição"], "order": 1},
        ],
        "kanban_columns": [
            {"name": "Triagem", "slug": "backlog", "color": "#4a4a6a", "order": 0, "is_default": True, "is_done": False},
            {"name": "Em elaboração", "slug": "in_progress", "color": "#7c6df0", "order": 1, "is_default": False, "is_done": False},
            {"name": "Aguardando cliente", "slug": "blocked", "color": "#f59e0b", "order": 2, "is_default": False, "is_done": False},
            {"name": "Concluído", "slug": "done", "color": "#5eead4", "order": 3, "is_default": False, "is_done": True},
        ],
        "agent_configs": {},
    },
    {
        "name": "Clínica",
        "slug": "clinica",
        "description": "Consultas, exames, retornos e convênio.",
        "custom_fields": [
            {"name": "convenio", "label": "Convênio", "field_type": "text", "required": False, "options": [], "order": 0},
            {"name": "tipo_atendimento", "label": "Tipo", "field_type": "select", "required": False,
             "options": ["Consulta", "Exame", "Retorno", "Convênio"], "order": 1},
        ],
        "kanban_columns": [
            {"name": "Agenda", "slug": "backlog", "color": "#4a4a6a", "order": 0, "is_default": True, "is_done": False},
            {"name": "Em atendimento", "slug": "in_progress", "color": "#7c6df0", "order": 1, "is_default": False, "is_done": False},
            {"name": "Pendente", "slug": "blocked", "color": "#f43f5e", "order": 2, "is_default": False, "is_done": False},
            {"name": "Finalizado", "slug": "done", "color": "#5eead4", "order": 3, "is_default": False, "is_done": True},
        ],
        "agent_configs": {},
    },
    {
        "name": "Construtora",
        "slug": "construtora",
        "description": "Obras, etapas, medições e fornecedores.",
        "custom_fields": [
            {"name": "obra", "label": "Obra", "field_type": "text", "required": False, "options": [], "order": 0},
            {"name": "etapa", "label": "Etapa", "field_type": "select", "required": False,
             "options": ["Obra", "Etapa", "Medição", "Fornecedor"], "order": 1},
        ],
        "kanban_columns": [
            {"name": "Planejamento", "slug": "backlog", "color": "#4a4a6a", "order": 0, "is_default": True, "is_done": False},
            {"name": "Em execução", "slug": "in_progress", "color": "#7c6df0", "order": 1, "is_default": False, "is_done": False},
            {"name": "Parada", "slug": "blocked", "color": "#f43f5e", "order": 2, "is_default": False, "is_done": False},
            {"name": "Concluído", "slug": "done", "color": "#5eead4", "order": 3, "is_default": False, "is_done": True},
        ],
        "agent_configs": {},
    },
]


def seed_vertical_templates(db: Session) -> None:
    if db.query(VerticalTemplate).count() > 0:
        return
    for row in VERTICAL_TEMPLATES:
        db.add(
            VerticalTemplate(
                id=uuid.uuid4(),
                name=row["name"],
                slug=row["slug"],
                description=row.get("description"),
                custom_fields=row.get("custom_fields", []),
                kanban_columns=row.get("kanban_columns", []),
                agent_configs=row.get("agent_configs") or {},
                is_public=True,
                created_at=datetime.utcnow(),
            )
        )
    db.commit()


def ensure_project_kanban_defaults(db: Session, project_id: uuid.UUID) -> None:
    """Garante 4 colunas padrão e pelo menos uma is_done — projetos legados."""
    n = db.query(KanbanColumn).filter(KanbanColumn.project_id == project_id).count()
    if n > 0:
        return
    for col in DEFAULT_KANBAN_COLUMNS:
        db.add(
            KanbanColumn(
                id=uuid.uuid4(),
                project_id=project_id,
                name=col["name"],
                slug=col["slug"],
                color=col["color"],
                order=col["order"],
                is_default=col["is_default"],
                is_done=col["is_done"],
                created_at=datetime.utcnow(),
            )
        )
    db.commit()


def backfill_all_projects_kanban(db: Session) -> None:
    for p in db.query(Project).all():
        ensure_project_kanban_defaults(db, p.id)
