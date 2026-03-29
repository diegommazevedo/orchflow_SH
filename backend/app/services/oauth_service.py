
import os
from urllib.parse import urlencode

import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
OAUTH_REDIRECT_BASE_URL = os.getenv("OAUTH_REDIRECT_BASE_URL", "http://localhost:5180")


def get_google_auth_url(state: str) -> str:
    q = urlencode(
        {
            "client_id": GOOGLE_CLIENT_ID,
            "redirect_uri": f"{OAUTH_REDIRECT_BASE_URL}/api/auth/google/callback",
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return f"https://accounts.google.com/o/oauth2/v2/auth?{q}"


async def exchange_google_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": f"{OAUTH_REDIRECT_BASE_URL}/api/auth/google/callback",
                "grant_type": "authorization_code",
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]
        user_res = await client.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_res.raise_for_status()
        u = user_res.json()
        return {
            "id": str(u.get("sub")),
            "email": u.get("email"),
            "name": u.get("name") or "Usuário Google",
            "avatar_url": u.get("picture"),
        }


def get_github_auth_url(state: str) -> str:
    q = urlencode(
        {
            "client_id": GITHUB_CLIENT_ID,
            "redirect_uri": f"{OAUTH_REDIRECT_BASE_URL}/api/auth/github/callback",
            "scope": "read:user user:email",
            "state": state,
        }
    )
    return f"https://github.com/login/oauth/authorize?{q}"


async def exchange_github_code(code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "code": code,
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "redirect_uri": f"{OAUTH_REDIRECT_BASE_URL}/api/auth/github/callback",
            },
        )
        token_res.raise_for_status()
        access_token = token_res.json()["access_token"]
        user_res = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
        )
        user_res.raise_for_status()
        u = user_res.json()

        email = u.get("email")
        if not email:
            emails_res = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
            emails_res.raise_for_status()
            emails = emails_res.json()
            primary = next((e for e in emails if e.get("primary")), None)
            email = primary.get("email") if primary else (emails[0].get("email") if emails else None)

        return {
            "id": str(u.get("id")),
            "email": email,
            "name": u.get("name") or u.get("login") or "Usuário GitHub",
            "avatar_url": u.get("avatar_url"),
        }
