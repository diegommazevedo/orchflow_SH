import { FormEvent, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function WorkspaceNewPage() {
  const { createInitialWorkspace, currentUser } = useAuth()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)
    try {
      await createInitialWorkspace(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lp-overlay">
      <div className="lp-card">
        <div className="lp-logo">
          <div className="lp-logo-dot" />
          <span>OrchFlow</span>
        </div>
        <p className="lp-tagline">Olá, {currentUser?.name ?? 'usuário'}. Crie seu workspace para continuar.</p>
        {error && <div className="lp-error">{error}</div>}
        <form className="lp-form" onSubmit={handleSubmit}>
          <label className="lp-label">
            Nome do workspace
            <input
              className="lp-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex.: Leilão Flow"
              required
              autoFocus
            />
          </label>
          <button className="lp-btn-primary" type="submit" disabled={loading}>
            {loading ? 'Criando…' : 'Criar workspace'}
          </button>
        </form>
      </div>
    </div>
  )
}
