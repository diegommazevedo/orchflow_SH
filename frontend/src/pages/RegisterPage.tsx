import { FormEvent, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function RegisterPage() {
  const { register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) {
      setError('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      await register(name, email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="lp-overlay">
      <div className="lp-card">
        <h2 className="ag-page-title">Criar conta</h2>
        {error && <div className="lp-error">{error}</div>}
        <form className="lp-form" onSubmit={onSubmit}>
          <input className="lp-input" placeholder="Nome" value={name} onChange={e => setName(e.target.value)} required />
          <input className="lp-input" type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="lp-input" type="password" placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} required />
          <input className="lp-input" type="password" placeholder="Confirmar senha" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          <button className="lp-btn-primary" type="submit" disabled={loading}>{loading ? 'Criando…' : 'Criar conta'}</button>
        </form>
      </div>
    </div>
  )
}
