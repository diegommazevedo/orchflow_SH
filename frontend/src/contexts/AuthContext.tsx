/**
 * contexts/AuthContext.tsx — Sprint 6B
 *
 * Context global de autenticação.
 * - Token salvo em localStorage key 'orchflow-token'
 * - axios Authorization header configurado automaticamente
 * - checkAuth() valida token salvo ao montar o App
 *
 * Leis respeitadas:
 *   - Senha nunca trafega após POST inicial
 *   - Token em localStorage (MVP — httpOnly cookie é Sprint 7)
 *   - user_id 'default' mantido como fallback em todos os outros contextos
 *   - CORS mantido (requisições via Vite proxy /api)
 */
import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react'
import axios from 'axios'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:       string
  name:     string
  email:    string
  nickname: string | null
  role:     string
}

interface AuthState {
  user:            AuthUser | null
  token:           string | null
  isAuthenticated: boolean
  isLoading:       boolean
}

interface AuthContextValue extends AuthState {
  login:     (email: string, password: string) => Promise<void>
  register:  (name: string, email: string, password: string, nickname?: string) => Promise<void>
  logout:    () => void
  checkAuth: () => Promise<void>
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null)

const TOKEN_KEY = 'orchflow-token'

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,      setUser]      = useState<AuthUser | null>(null)
  const [token,     setToken]     = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)  // true até checkAuth concluir

  // Aplica o token nos headers axios globais
  const _applyToken = useCallback((t: string | null) => {
    if (t) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${t}`
    } else {
      delete axios.defaults.headers.common['Authorization']
    }
  }, [])

  // Persiste token + configura axios
  const _setSession = useCallback((t: string, u: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, t)
    _applyToken(t)
    setToken(t)
    setUser(u)
  }, [_applyToken])

  const _clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    _applyToken(null)
    setToken(null)
    setUser(null)
  }, [_applyToken])

  // ── checkAuth: restaura sessão do localStorage ────────────────────────────

  const checkAuth = useCallback(async () => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) {
      setIsLoading(false)
      return
    }

    try {
      _applyToken(saved)
      const { data } = await axios.get('/api/auth/me')
      setToken(saved)
      setUser(data)
    } catch {
      // Token inválido ou expirado — limpa sem erro visual
      _clearSession()
    } finally {
      setIsLoading(false)
    }
  }, [_applyToken, _clearSession])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // ── login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await axios.post('/api/auth/login', { email, password })
    _setSession(data.token, data.user)
  }, [_setSession])

  // ── register ──────────────────────────────────────────────────────────────

  const register = useCallback(async (
    name: string,
    email: string,
    password: string,
    nickname?: string,
  ) => {
    const { data } = await axios.post('/api/auth/register', { name, email, password, nickname })
    _setSession(data.token, data.user)
  }, [_setSession])

  // ── logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    axios.post('/api/auth/logout').catch(() => {})  // fire-and-forget
    _clearSession()
  }, [_clearSession])

  // ── Interceptor de resposta: 401 → logout automático ─────────────────────

  useEffect(() => {
    const id = axios.interceptors.response.use(
      res => res,
      err => {
        if (err.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
          _clearSession()
          // Dispara evento customizado para App.tsx redirecionar
          window.dispatchEvent(new Event('orchflow:logout'))
        }
        return Promise.reject(err)
      },
    )
    return () => axios.interceptors.response.eject(id)
  }, [_clearSession])

  return (
    <AuthContext.Provider value={{
      user, token, isAuthenticated: !!user, isLoading,
      login, register, logout, checkAuth,
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
