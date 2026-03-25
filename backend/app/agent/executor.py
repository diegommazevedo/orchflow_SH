"""
agent/executor.py — Sprint 3 completo
Toda inserção/edição passa pela ConformityEngine antes de tocar o banco.
"""

from datetime import datetime

from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.models.task import Task, TaskStatus, EisenhowerQuadrant
from app.models.project import Project
from app.models.user import User
from app.models.activity import ActivityLog
from app.agent.intent_engine import IntentResult
from app.agent.conformity import conform_task_payload
import uuid


def resolve_assignee(hint: str | None, db: Session) -> tuple[str | None, str | None]:
    """
    Resolve apelido/nome → (user_id, display_name)
    Busca por nickname, nome ou email (case-insensitive).
    """
    if not hint:
        return None, None
    user = db.query(User).filter(
        or_(
            User.nickname.ilike(f"%{hint}%"),
            User.name.ilike(f"%{hint}%"),
        )
    ).first()
    if user:
        return str(user.id), user.name
    return None, hint  # não encontrou — mantém hint como display


def execute_intent(intent: IntentResult, project_id: str, db: Session) -> dict:
    action = intent.action
    params = intent.params

    # ── CREATE TASK ───────────────────────────────────────
    if action == "create_task":
        assignee_id, assignee_display = resolve_assignee(params.assignee_hint, db)

        # conformidade universal antes de salvar
        conformed = conform_task_payload({
            'title':        intent.conformed_title or params.title or "Nova tarefa",
            'description':  params.description,
            'due_date':     params.due_date,
            'quadrant':     params.quadrant or 'q2',
            'status':       'backlog',
            'assignee_name': assignee_display,
            'project_name': _get_project_name(project_id, db),
        })

        quadrant = EisenhowerQuadrant(conformed['quadrant']) \
            if conformed['quadrant'] in [q.value for q in EisenhowerQuadrant] \
            else EisenhowerQuadrant.q2

        task = Task(
            title=conformed['title'],
            description=conformed['description'],
            status=TaskStatus.backlog,
            quadrant=quadrant,
            project_id=uuid.UUID(project_id),
            assignee_id=uuid.UUID(assignee_id) if assignee_id else None,
            due_date_iso=conformed['due_date']['iso'] if conformed.get('due_date') else None,
        )
        db.add(task)
        db.commit()
        db.refresh(task)

        due_info = ""
        if conformed.get('due_date'):
            due_info = f" · {conformed['due_date']['display']} ({conformed['due_date']['gap']})"

        assignee_info = f" · {assignee_display}" if assignee_display else ""

        return {
            "success": True,
            "message": f'✓ Tarefa criada: "{task.title}"{assignee_info}{due_info}',
            "data": {"id": str(task.id), "title": task.title}
        }

    # ── UPDATE TASK STATUS ────────────────────────────────
    if action == "update_task_status":
        hint = params.task_name_hint or params.title or ""
        task = _find_task(hint, project_id, db)
        if not task:
            return {"success": False, "message": f'Tarefa "{hint}" não encontrada.'}

        new_status = TaskStatus(params.status) \
            if params.status in [s.value for s in TaskStatus] \
            else TaskStatus.in_progress

        task.status = new_status
        db.commit()

        labels = {"backlog": "Backlog", "in_progress": "Em andamento", "done": "Concluído"}
        return {
            "success": True,
            "message": f'✓ "{task.title}" → {labels[new_status.value]}',
        }

    # ── DELETE TASK ───────────────────────────────────────
    if action == "delete_task":
        hint = params.task_name_hint or params.title or ""
        task = _find_task(hint, project_id, db)
        if not task:
            return {"success": False, "message": f'Tarefa "{hint}" não encontrada.'}
        title = task.title
        task.deleted_at = datetime.utcnow()
        task.deleted_by = "default"
        db.add(ActivityLog(
            entity_type="task",
            entity_id=task.id,
            user_id="default",
            action="deleted",
            extra_data={"title": title},
        ))
        db.commit()
        return {"success": True, "message": f'✓ Tarefa "{title}" movida para a lixeira.'}

    # ── LIST TASKS ────────────────────────────────────────
    if action == "list_tasks":
        tasks = (
            db.query(Task)
            .filter(Task.project_id == uuid.UUID(project_id), Task.deleted_at.is_(None))
            .all()
        )
        if not tasks:
            return {"success": True, "message": "Nenhuma tarefa neste projeto."}
        icons = {"backlog": "📋", "in_progress": "🔄", "done": "✓"}
        lines = [
            f'{icons.get(t.status.value,"·")} {t.title} [{t.quadrant.value.upper()}]'
            for t in tasks
        ]
        return {"success": True, "message": f"Tarefas ({len(tasks)}):\n\n" + "\n".join(lines)}

    # ── CREATE PROJECT ────────────────────────────────────
    if action == "create_project":
        from app.agent.conformity import conform_name
        name = conform_name(params.title or "Novo projeto")
        project = Project(name=name)
        db.add(project)
        db.commit()
        db.refresh(project)
        return {"success": True, "message": f'✓ Projeto criado: "{project.name}"',
                "data": {"id": str(project.id)}}

    # ── LIST PROJECTS ─────────────────────────────────────
    if action == "list_projects":
        projects = db.query(Project).all()
        if not projects:
            return {"success": True, "message": "Nenhum projeto encontrado."}
        return {"success": True,
                "message": "Projetos:\n\n" + "\n".join(f"· {p.name}" for p in projects)}

    return {"success": False, "message": "Ação não reconhecida."}


def _find_task(hint: str, project_id: str, db: Session) -> Task | None:
    if not hint:
        return None
    return (
        db.query(Task)
        .filter(
            Task.project_id == uuid.UUID(project_id),
            Task.title.ilike(f"%{hint}%"),
            Task.deleted_at.is_(None),
        )
        .first()
    )


def _get_project_name(project_id: str, db: Session) -> str | None:
    p = db.query(Project).filter(Project.id == uuid.UUID(project_id)).first()
    return p.name if p else None
