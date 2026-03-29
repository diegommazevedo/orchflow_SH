import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api, setApiAccessToken } from '../services/api'

export function OAuthCallbackPage() {
  const { completeOAuthLogin } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function run() {
      const url = new URL(window.location.href)
      const errorParam = url.searchParams.get('error')
      if (errorParam) {
        setError('Falha na autenticação. Tente novamente.')
        return
      }
      // CORREÇÃO 3C: ler ?code= (não ?access_token=)
      const code = url.searchParams.get('code')
      if (!code) {
        setError('Parâmetros de autenticação ausentes.')
        return
      }
      try {
        // Trocar one-time code por access_token (refresh_token chega via httpOnly cookie)
        const { data } = await api.post<{
          access_token: string
          user: { id: string; name: string; email: string; avatar_url?: string }
        }>('/auth/oauth/exchange', { code })

        // Popula singleton em memória — não salva em localStorage
        setApiAccessToken(data.access_token)
        await completeOAuthLogin(data.access_token)
        window.history.replaceState({}, '', '/')
        window.dispatchEvent(new Event('popstate'))
      } catch {
        setError('Falha no callback OAuth. Tente novamente.')
      }
    }
    void run()
  }, [completeOAuthLogin])

  if (error) {
    return (
      <div className="lp-overlay">
        <div className="lp-card">
          <div className="lp-error">{error}</div>
          <a className="lp-btn-primary" href="/login">Voltar para login</a>
        </div>
      </div>
    )
  }
  return (
    <div className="lp-overlay">
      <div className="lp-card">Concluindo autenticação…</div>
    </div>
  )
}
