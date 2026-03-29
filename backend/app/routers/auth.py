import os
import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.database import get_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember
from app.auth.dependencies import get_current_user
from app.services.auth_service import (
    authenticate_user,
    consume_oauth_code,
    create_access_token,
    create_refresh_token,
    create_user,
    get_or_create_oauth_user,
    refresh_access_token,
    revoke_refresh_token,
    store_oauth_code,
)
from app.services.oauth_service import (
    exchange_github_code,
    exchange_google_code,
    get_github_auth_url,
    get_google_auth_url,
)

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()
OAUTH_REDIRECT_BASE_URL = os.getenv("OAUTH_REDIRECT_BASE_URL", "http://localhost:5180")


class RegisterBody(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RefreshBody(BaseModel):
    """workspace_id still sent in body; refresh_token read from cookie."""
    workspace_id: str


COOKIE_MAX_AGE = 30 * 24 * 3600  # 30 dias
COOKIE_SECURE = os.getenv("ENVIRONMENT", "development") == "production"


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key="refresh_token", httponly=True, samesite="lax")


def _workspace_for_user(db: Session, user: User) -> Workspace | None:
    member = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).first()
    if not member:
        return None
    return db.query(Workspace).filter(Workspace.id == member.workspace_id).first()


@router.post("/register")
@limiter.limit("3/minute")
def register(request: Request, body: RegisterBody, response: Response, db: Session = Depends(get_db)):
    user = create_user(body.email, body.password, body.name, db)
    ws = _workspace_for_user(db, user)
    workspace_id = str(ws.id) if ws else "00000000-0000-0000-0000-000000000001"
    access_token = create_access_token(str(user.id), workspace_id)
    rt = create_refresh_token(str(user.id), db)
    _set_refresh_cookie(response, rt)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "name": user.name, "email": user.email, "avatar_url": user.avatar_url},
    }


@router.post("/login")
@limiter.limit("5/minute")
def login(request: Request, body: LoginBody, response: Response, db: Session = Depends(get_db)):
    user = authenticate_user(body.email, body.password, db)
    if not user:
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    ws = _workspace_for_user(db, user)
    workspace_id = str(ws.id) if ws else "00000000-0000-0000-0000-000000000001"
    access_token = create_access_token(str(user.id), workspace_id)
    rt = create_refresh_token(str(user.id), db)
    _set_refresh_cookie(response, rt)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "name": user.name, "email": user.email, "avatar_url": user.avatar_url},
    }


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh(request: Request, body: RefreshBody, response: Response, db: Session = Depends(get_db)):
    rt_cookie = request.cookies.get("refresh_token")
    if not rt_cookie:
        raise HTTPException(status_code=401, detail="Refresh token não encontrado")
    result = refresh_access_token(rt_cookie, body.workspace_id, db)
    # result now contains access_token + new refresh_token (rotation)
    if isinstance(result, dict):
        _set_refresh_cookie(response, result["refresh_token"])
        return {"access_token": result["access_token"], "token_type": "bearer"}
    # Fallback for legacy return (just access_token string)
    return {"access_token": result, "token_type": "bearer"}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    rt_cookie = request.cookies.get("refresh_token")
    if rt_cookie:
        revoke_refresh_token(rt_cookie, db)
    _clear_refresh_cookie(response)
    return {"ok": True}


@router.get("/google")
def google(response: Response):
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(get_google_auth_url(state))
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=600,
    )
    return response


@router.get("/google/callback")
async def google_callback(
    request: Request,
    response: Response,
    code: str,
    state: str = "",
    db: Session = Depends(get_db),
):
    state_cookie = request.cookies.get("oauth_state", "")
    if not state_cookie or state_cookie != state:
        raise HTTPException(status_code=400, detail="Estado inválido. Tente novamente.")
    profile = await exchange_google_code(code)
    user = get_or_create_oauth_user(
        "google", profile["id"], profile.get("email"),
        profile.get("name"), profile.get("avatar_url"), db,
    )
    ws = _workspace_for_user(db, user)
    workspace_id = str(ws.id) if ws else "00000000-0000-0000-0000-000000000001"
    rt = create_refresh_token(str(user.id), db)
    ot_code = store_oauth_code(str(user.id), workspace_id)
    resp = RedirectResponse(f"{OAUTH_REDIRECT_BASE_URL}/auth/callback?code={ot_code}")
    _set_refresh_cookie(resp, rt)
    resp.delete_cookie("oauth_state")
    return resp


@router.get("/github")
def github(response: Response):
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(get_github_auth_url(state))
    response.set_cookie(
        key="oauth_state",
        value=state,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=600,
    )
    return response


@router.get("/github/callback")
async def github_callback(
    request: Request,
    response: Response,
    code: str,
    state: str = "",
    db: Session = Depends(get_db),
):
    state_cookie = request.cookies.get("oauth_state", "")
    if not state_cookie or state_cookie != state:
        raise HTTPException(status_code=400, detail="Estado inválido. Tente novamente.")
    profile = await exchange_github_code(code)
    user = get_or_create_oauth_user(
        "github", profile["id"], profile.get("email"),
        profile.get("name"), profile.get("avatar_url"), db,
    )
    ws = _workspace_for_user(db, user)
    workspace_id = str(ws.id) if ws else "00000000-0000-0000-0000-000000000001"
    rt = create_refresh_token(str(user.id), db)
    ot_code = store_oauth_code(str(user.id), workspace_id)
    resp = RedirectResponse(f"{OAUTH_REDIRECT_BASE_URL}/auth/callback?code={ot_code}")
    _set_refresh_cookie(resp, rt)
    resp.delete_cookie("oauth_state")
    return resp


class OAuthExchangeBody(BaseModel):
    code: str = Field(min_length=1, max_length=100)


@router.post("/oauth/exchange")
def oauth_exchange(body: OAuthExchangeBody, response: Response, db: Session = Depends(get_db)):
    """Troca one-time code OAuth por access_token. Code válido por 60 segundos."""
    data = consume_oauth_code(body.code)
    if not data:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado.")
    user = db.query(User).filter(User.id == uuid.UUID(data["user_id"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário inválido.")
    access_token = create_access_token(data["user_id"], data["workspace_id"])
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.name,
            "email": user.email,
            "avatar_url": user.avatar_url,
        },
    }


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "avatar_url": current_user.avatar_url,
        "nickname": current_user.nickname,
        "role": current_user.role,
    }
