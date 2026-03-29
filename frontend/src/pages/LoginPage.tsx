/**
 * pages/LoginPage.tsx — Sprint 6B
 *
 * Tela de autenticação (login + registro).
 * Design: card central 400px, mesma paleta do sistema (CSS vars).
 *
 * Leis respeitadas:
 *   - Senha nunca em estado persistido — apenas transitória no form
 *   - useConformField modo silent em name e nickname (ConformityEngine)
 *   - Erros inline, nunca bloqueantes
 *   - CORS via proxy Vite (/api)
 */
import { useEffect, useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useConformField } from '../hooks/useConformField'

type Tab = 'login' | 'register'

export function LoginPage() {
  const { login, register, loginWithGoogle, loginWithGithub, isAuthenticated } = useAuth()
  const [tab,      setTab]      = useState<Tab>('login')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  // ── Campos login ──────────────────────────────────────────────────────────
  const [loginEmail, setLoginEmail]       = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // ── Campos registro ───────────────────────────────────────────────────────
  const [regEmail,    setRegEmail]    = useState('')
  const [regPassword, setRegPassword] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      window.history.replaceState({}, '', '/')
      window.dispatchEvent(new Event('popstate'))
    }
  }, [isAuthenticated])

  const nameConform     = useConformField('name',        { mode: 'silent' })
  const nicknameConform = useConformField('name',        { mode: 'silent' })

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(loginEmail.trim(), loginPassword)
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Erro ao entrar. Verifique suas credenciais.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const name = nameConform.bind.value as string
    if (!name.trim()) { setError('Nome é obrigatório.'); return }
    if (!regEmail.trim()) { setError('Email é obrigatório.'); return }
    if (regPassword.length < 6) { setError('Senha deve ter pelo menos 6 caracteres.'); return }

    setLoading(true)
    try {
      const nickname = (nicknameConform.bind.value as string) || undefined
      void nickname
      await register(name.trim(), regEmail.trim(), regPassword)
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao criar conta.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lp-overlay">
      <div className="lp-card">
        {/* Logo */}
        <div className="lp-logo">
          <div className="lp-logo-dot" />
          <span>OrchFlow</span>
        </div>
        <p className="lp-tagline">Gestão com IA conversacional</p>

        {/* Abas */}
        <div className="lp-tabs">
          <button
            className={`lp-tab ${tab === 'login' ? 'lp-tab--active' : ''}`}
            onClick={() => { setTab('login'); setError(null) }}
            type="button"
          >
            Entrar
          </button>
          <button
            className={`lp-tab ${tab === 'register' ? 'lp-tab--active' : ''}`}
            onClick={() => { setTab('register'); setError(null) }}
            type="button"
          >
            Criar conta
          </button>
        </div>

        {/* Erro global */}
        {error && <div className="lp-error">{error}</div>}

        {/* ── Login ── */}
        {tab === 'login' && (
          <form className="lp-form" onSubmit={handleLogin}>
            <label className="lp-label">
              Email
              <input
                className="lp-input"
                type="email"
                placeholder="seu@email.com"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
                required
                autoFocus
              />
            </label>

            <label className="lp-label">
              Senha
              <input
                className="lp-input"
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                required
              />
            </label>

            <button
              className="lp-btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="lp-btn-secondary" onClick={loginWithGoogle}>Entrar com Google</button>
            <button type="button" className="lp-btn-secondary" onClick={loginWithGithub}>Entrar com GitHub</button>
            <button
              type="button"
              className="lp-btn-link"
              onClick={() => {
                window.history.pushState({}, '', '/register')
                window.dispatchEvent(new Event('popstate'))
              }}
            >
              Criar conta
            </button>
          </form>
        )}

        {/* ── Registro ── */}
        {tab === 'register' && (
          <form className="lp-form" onSubmit={handleRegister}>
            <label className="lp-label">
              Nome
              <div className="lp-field-wrap" style={{ position: 'relative' }}>
                <input
                  className="lp-input"
                  type="text"
                  placeholder="Seu nome completo"
                  {...nameConform.bind}
                  autoFocus
                />
                {nameConform.showCheck && (
                  <span className="conform-check" aria-hidden>✓</span>
                )}
              </div>
            </label>

            <label className="lp-label">
              Email
              <input
                className="lp-input"
                type="email"
                placeholder="seu@email.com"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
                required
              />
            </label>

            <label className="lp-label">
              Senha
              <input
                className="lp-input"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={regPassword}
                onChange={e => setRegPassword(e.target.value)}
                required
              />
            </label>

            <label className="lp-label">
              Apelido <span className="lp-optional">(opcional — usado pelo agente)</span>
              <div style={{ position: 'relative' }}>
                <input
                  className="lp-input"
                  type="text"
                  placeholder="ex: zé, maria, dev"
                  {...nicknameConform.bind}
                />
                {nicknameConform.showCheck && (
                  <span className="conform-check" aria-hidden>✓</span>
                )}
              </div>
            </label>

            <button
              className="lp-btn-primary"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
