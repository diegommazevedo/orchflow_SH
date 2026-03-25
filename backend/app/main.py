from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models import Project, Task, User  # noqa: F401
from app.models import UserSemanticProfile, SemanticMemory  # noqa: F401 — Sprint 3C
from app.models.activity import Comment, ActivityLog  # noqa: F401 — Sprint 5A
from app.models.sprint import Sprint, SprintTask       # noqa: F401 — Sprint 5B
from app.models.focus import FocusSession, ProductivitySnapshot  # noqa: F401 — Sprint 5C
from app.routers import projects, tasks
from app.routers.agent import router as agent_router
from app.routers.voice import router as voice_router
from app.routers.upload import router as upload_router
from app.routers.roi import router as roi_router
from app.routers.export import router as export_router
from app.routers.comments import comments_router, activity_router
from app.routers.sprints import router as sprints_router
from app.routers.focus import router as focus_router
from app.routers.analytics import router as analytics_router
from app.routers.auth import router as auth_router

app = FastAPI(title="OrchFlow API", version="1.4.0")

import os as _os

_DEFAULT_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:5180",
    # Produção — Vercel
    "https://orchflow-sh.vercel.app",
    "https://orchflow-sh-git-main-diegommazevedos-projects.vercel.app",
    "https://orchflow-olr0iao3c-diegommazevedos-projects.vercel.app",
]
_extra = _os.getenv("ALLOWED_ORIGINS", "")
_extra_list = [o.strip() for o in _extra.split(",") if o.strip()]
_all_origins = list(dict.fromkeys(_DEFAULT_ORIGINS + _extra_list))

app.add_middleware(
    CORSMiddleware,
    allow_origins=_all_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Migration segura: adiciona 'blocked' ao enum taskstatus (pg16 suporta IF NOT EXISTS)
    try:
        with engine.connect() as conn:
            conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TYPE taskstatus ADD VALUE IF NOT EXISTS 'blocked'"
                )
            )
            conn.commit()
    except Exception:
        pass  # enum já pode conter o valor ou não usar pg native enum


app.include_router(projects.router,      prefix="/api/projects",  tags=["projects"])
app.include_router(tasks.router,         prefix="/api/tasks",     tags=["tasks"])
app.include_router(agent_router,         prefix="/api/agent",     tags=["agent"])
app.include_router(voice_router,         prefix="/api/voice",     tags=["voice"])
app.include_router(upload_router,        prefix="/api/upload",    tags=["upload"])
app.include_router(roi_router,           prefix="/api/roi",       tags=["roi"])
app.include_router(export_router,        prefix="/api/export",    tags=["export"])
app.include_router(comments_router,      prefix="/api/comments",  tags=["comments"])
app.include_router(activity_router,      prefix="/api/activity",  tags=["activity"])
app.include_router(sprints_router,       prefix="/api/sprints",   tags=["sprints"])
app.include_router(focus_router,         prefix="/api/focus",     tags=["focus"])
app.include_router(analytics_router,     prefix="/api/analytics", tags=["analytics"])
app.include_router(auth_router,          prefix="/api/auth",      tags=["auth"])


@app.get("/")
def root():
    return {"status": "OrchFlow online", "version": "1.4.0"}
