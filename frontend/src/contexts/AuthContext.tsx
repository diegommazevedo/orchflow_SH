import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'
import { isAxiosError } from 'axios'
import {
  api,
  createWorkspace,
  friendlyHttpStatus,
  getApiAccessToken,
  getMe,
  getMyWorkspaces,
  login as loginApi,
  loginOAuth,
  logoutApi,
  register as registerApi,
  setApiAccessToken,
} from '../services/api'
import type { AuthUser, Workspace } from '../types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface AuthState {
  currentUser:      AuthUser | null
  currentWorkspace: Workspace | null
  accessToken:      string | null
  isAuthenticated: boolean
  isLoading:       boolean
}

interface AuthContextValue extends AuthState {
  login:     (email: string, password: string) => Promise<void>
  loginWithGoogle: () => void
  loginWithGithub: () => void
  register:  (name: string, email: string, password: string) => Promise<void>
  createInitialWorkspace: (name: string) => Promise<void>
  completeOAuthLogin: (accessToken: string) => Promise<void>
  logout:    () => void
  checkAuth: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'orchflow-token'
const WORKSPACE_KEY = 'orchflow-workspace-id'

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)  // true até checkAuth concluir

  const _setSession = useCallback((access: string, user: AuthUser, ws: Workspace | null) => {
    // access_token apenas em memória — sem localStorage para o token
    setApiAccessToken(access)
    // refresh_token chega via httpOnly cookie — não precisa de ação aqui
    if (ws) localStorage.setItem(WORKSPACE_KEY, ws.id)
    else localStorage.removeItem(WORKSPACE_KEY)
    setAccessToken(access)
    setCurrentUser(user)
    setCurrentWorkspace(ws)
  }, [])

  const _clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)   // legado — limpa se existir
    localStorage.removeItem(WORKSPACE_KEY)
    setApiAccessToken(null)
    setAccessToken(null)
    setCurrentWorkspace(null)
    setCurrentUser(null)
  }, [])

  // ── checkAuth: restaura sessão via refresh explícito ─────────────────────
  // Faz refresh explícito ANTES de chamar getMe(), evitando 401 desnecessário
  // e o deadlock circular no interceptor.

  const checkAuth = useCallback(async () => {
    const wsId = localStorage.getItem(WORKSPACE_KEY)

    // Se não há token em memória, tenta restaurar via refresh (cookie httpOnly)
    if (!getApiAccessToken()) {
      if (!wsId) {
        // Sem workspace salvo → sem sessão anterior → não há nada a restaurar
        setIsLoading(false)
        return
      }
      try {
        const { data } = await api.post<{ access_token: string }>('/auth/refresh', {
          workspace_id: wsId,
        })
        setApiAccessToken(data.access_token)
      } catch {
        // Refresh falhou (cookie expirado ou ausente) → sessão encerrada
        _clearSession()
        setIsLoading(false)
        return
      }
    }

    // Token em memória presente — busca dados do usuário
    try {
      const me = await getMe()
      const workspaces = await getMyWorkspaces()
      const chosen = workspaces.find(w => w.id === wsId) ?? workspaces[0] ?? null
      if (chosen) localStorage.setItem(WORKSPACE_KEY, chosen.id)
      const currentToken = getApiAccessToken()
      setAccessToken(currentToken)
      setCurrentUser(me)
      setCurrentWorkspace(chosen)
    } catch (err: unknown) {
      const status = isAxiosError(err) ? err.response?.status : undefined
      if (status != null && status !== 401) {
        const msg = friendlyHttpStatus(status)
        window.dispatchEvent(
          new CustomEvent('orchflow:api-error', { detail: { message: msg } }),
        )
      }
      _clearSession()
    } finally {
      setIsLoading(false)
    }
  }, [_clearSession])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // ── login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    try {
      const out = await loginApi(email, password)
      // Popula singleton em memória ANTES de getMyWorkspaces para que o
      // interceptor do Axios já encontre o Bearer no singleton
      setApiAccessToken(out.access_token)
      const workspaces = await getMyWorkspaces()
      const chosen = workspaces[0] ?? null
      _setSession(out.access_token, out.user, chosen)
    } catch (e) {
      const st = isAxiosError(e) ? e.response?.status : undefined
      const msg =
        st != null
          ? friendlyHttpStatus(st)
          : 'Não foi possível entrar. Tente novamente.'
      throw new Error(msg)
    }
  }, [_setSession])

  // ── register ──────────────────────────────────────────────────────────────

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const out = await registerApi({ name, email, password })
      setApiAccessToken(out.access_token)
      const workspaces = await getMyWorkspaces()
      const chosen = workspaces[0] ?? null
      _setSession(out.access_token, out.user, chosen)
    } catch (e) {
      const st = isAxiosError(e) ? e.response?.status : undefined
      const msg =
        st != null
          ? friendlyHttpStatus(st)
          : 'Não foi possível criar a conta. Tente novamente.'
      throw new Error(msg)
    }
  }, [_setSession])

  const createInitialWorkspace = useCallback(async (name: string) => {
    const ws = await createWorkspace(name)
    localStorage.setItem(WORKSPACE_KEY, ws.id)
    setCurrentWorkspace(ws)
  }, [])

  const completeOAuthLogin = useCallback(async (access: string) => {
    localStorage.setItem(TOKEN_KEY, access)
    // refresh_token arrives as httpOnly cookie from OAuth callback
    const me = await getMe()
    const workspaces = await getMyWorkspaces()
    const chosen = workspaces[0] ?? null
    _setSession(access, me, chosen)
  }, [_setSession])

  // ── logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    // refresh_token is in httpOnly cookie — sent automatically
    logoutApi().catch(() => {})
    _clearSession()
  }, [_clearSession])

  return (
    <AuthContext.Provider value={{
      currentUser,
      currentWorkspace,
      accessToken,
      isAuthenticated: !!currentUser,
      isLoading,
      login,
      loginWithGoogle: () => loginOAuth('google'),
      loginWithGithub: () => loginOAuth('github'),
      register,
      createInitialWorkspace,
      completeOAuthLogin,
      logout,
      checkAuth,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
