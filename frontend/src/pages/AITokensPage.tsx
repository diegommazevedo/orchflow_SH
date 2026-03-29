/**
 * AITokensPage — Sprint 7.5: AI Token Manager
 *
 * Seções:
 * 1. Carteira — saldo, total gasto, alerta
 * 2. Uso por motor (últimos 30 dias)
 * 3. Uso por agente (tabela)
 * 4. Histórico diário (barras CSS puro)
 * 5. Motores disponíveis
 *
 * Leis respeitadas:
 * - Admin only: crédito manual
 * - API keys nunca expostas (só backend)
 * - Saldo negativo nunca permitido (HTTP 402 no backend)
 */
import { useState } from 'react'
import { useAIEngines, useAIUsage, useAIWallet } from '../hooks/useAITokens'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(4)
}

function fmtCents(n: number): string {
  if (n < 0.0001) return '< $0.0001'
  return `$${n.toFixed(4)}`
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function WalletCard({
  balance,
  totalSpent,
  threshold,
  onCredit,
  onSetAlert,
}: {
  balance: number
  totalSpent: number
  threshold?: number
  onCredit: (amount: number, desc: string) => void
  onSetAlert: (t: number | null) => void
}) {
  const [showCredit, setShowCredit]   = useState(false)
  const [showAlert, setShowAlert]     = useState(false)
  const [amount, setAmount]           = useState('')
  const [creditDesc, setCreditDesc]   = useState('')
  const [alertVal, setAlertVal]       = useState(threshold != null ? String(threshold) : '')

  const isLow = threshold != null && balance <= threshold

  return (
    <div className="ai-wallet-card">
      <div className="ai-wallet-balance">
        <span className="ai-wallet-label">Saldo disponível</span>
        <span className="ai-wallet-amount" style={{ color: isLow ? '#f43f5e' : '#5eead4' }}>
          ${fmt(balance)}
        </span>
        {isLow && (
          <span className="ai-wallet-alert-badge">⚠ Saldo baixo</span>
        )}
      </div>

      <div className="ai-wallet-meta">
        <div className="ai-wallet-meta-row">
          <span className="ai-wallet-meta-label">Total gasto</span>
          <span className="ai-wallet-meta-val">${fmt(totalSpent)}</span>
        </div>
        {threshold != null && (
          <div className="ai-wallet-meta-row">
            <span className="ai-wallet-meta-label">Alerta em</span>
            <span className="ai-wallet-meta-val">${fmt(threshold)}</span>
          </div>
        )}
      </div>

      <div className="ai-wallet-actions">
        <button className="btn-primary-sm" onClick={() => setShowCredit(true)}>
          + Adicionar créditos
        </button>
        <button className="btn-secondary-sm" onClick={() => setShowAlert(true)}>
          🔔 Definir alerta
        </button>
      </div>

      {/* Modal crédito */}
      {showCredit && (
        <div className="ps-overlay" onClick={() => setShowCredit(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-title">Adicionar créditos</div>
            <label className="ps-modal-label">
              Valor (USD)
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="ps-modal-input"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </label>
            <label className="ps-modal-label">
              Descrição
              <input
                className="ps-modal-input"
                value={creditDesc}
                onChange={e => setCreditDesc(e.target.value)}
                placeholder="Ex: Recarga mensal"
              />
            </label>
            <div className="ps-modal-actions">
              <button className="ps-modal-btn ps-modal-btn-cancel" onClick={() => setShowCredit(false)}>
                Cancelar
              </button>
              <button
                className="ps-modal-btn ps-modal-btn-confirm"
                onClick={() => {
                  const v = parseFloat(amount)
                  if (!isNaN(v) && v > 0) {
                    onCredit(v, creditDesc)
                    setShowCredit(false)
                    setAmount('')
                    setCreditDesc('')
                  }
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal alerta */}
      {showAlert && (
        <div className="ps-overlay" onClick={() => setShowAlert(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-title">Threshold de alerta</div>
            <label className="ps-modal-label">
              Alertar quando saldo ≤ (USD) — vazio para desativar
              <input
                type="number"
                min="0"
                step="0.01"
                className="ps-modal-input"
                value={alertVal}
                onChange={e => setAlertVal(e.target.value)}
                autoFocus
              />
            </label>
            <div className="ps-modal-actions">
              <button className="ps-modal-btn ps-modal-btn-cancel" onClick={() => setShowAlert(false)}>
                Cancelar
              </button>
              <button
                className="ps-modal-btn ps-modal-btn-confirm"
                onClick={() => {
                  const v = alertVal.trim() === '' ? null : parseFloat(alertVal)
                  onSetAlert(v === undefined || isNaN(v as number) ? null : v)
                  setShowAlert(false)
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Gráfico de barras diário (CSS puro) ───────────────────────────────────────

function DailyChart({ days }: { days: { date: string; cost: number; calls: number }[] }) {
  if (!days.length) return <div className="ai-empty">Sem dados no período.</div>
  const maxCost = Math.max(...days.map(d => d.cost), 0.0001)
  return (
    <div className="ai-daily-chart">
      {days.map(d => {
        const pct = Math.max((d.cost / maxCost) * 100, d.cost > 0 ? 4 : 0)
        return (
          <div key={d.date} className="ai-daily-bar-wrap" title={`${d.date}: $${fmt(d.cost)} · ${d.calls} chamadas`}>
            <div className="ai-daily-bar" style={{ height: `${pct}%` }} />
            <span className="ai-daily-label">{d.date.slice(5)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AITokensPage() {
  const [days, setDays] = useState(30)

  const { wallet, loading: wLoading, creditWallet, setAlert } = useAIWallet()
  const { summary, logs, loading: uLoading }                  = useAIUsage(days)
  const { engines, loading: eLoading }                        = useAIEngines()

  const usedEngines = new Set(summary?.by_engine.map(e => e.engine) ?? [])

  return (
    <div className="ai-tokens-page">
      <div className="ai-tokens-header">
        <h2 className="ai-tokens-title">⚡ IA & Créditos</h2>
        <div className="ai-tokens-period">
          <span>Período:</span>
          {[7, 14, 30, 90].map(d => (
            <button
              key={d}
              className={`ai-period-btn${days === d ? ' active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* ── 1. Carteira ──────────────────────────────────────────────── */}
      <section className="ai-section">
        <h3 className="ai-section-title">Carteira</h3>
        {wLoading ? (
          <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
        ) : wallet ? (
          <WalletCard
            balance={wallet.balance_usd}
            totalSpent={wallet.total_spent_usd}
            threshold={wallet.alert_threshold_usd}
            onCredit={creditWallet}
            onSetAlert={setAlert}
          />
        ) : (
          <div className="ai-empty">Carteira não encontrada.</div>
        )}
      </section>

      {/* ── 2. Uso por motor ─────────────────────────────────────────── */}
      <section className="ai-section">
        <h3 className="ai-section-title">Uso por motor — últimos {days}d</h3>
        {uLoading ? (
          <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
        ) : !summary?.by_engine.length ? (
          <div className="ai-empty">Sem uso registrado no período.</div>
        ) : (
          <div className="ai-engine-grid">
            {summary.by_engine.map(e => {
              const eng = engines.find(x => x.slug === e.engine)
              const avgCost = e.calls > 0 ? e.cost / e.calls : 0
              return (
                <div key={e.engine} className="ai-engine-card">
                  <div className="ai-engine-name">{eng?.name ?? e.engine}</div>
                  <div className="ai-engine-caps">
                    {(eng?.capabilities ?? []).map(c => (
                      <span key={c} className="ai-cap-badge">{c}</span>
                    ))}
                  </div>
                  <div className="ai-engine-stats">
                    <span className="ai-stat-row">
                      <span className="ai-stat-label">Total</span>
                      <span className="ai-stat-val">{fmtCents(e.cost)}</span>
                    </span>
                    <span className="ai-stat-row">
                      <span className="ai-stat-label">Chamadas</span>
                      <span className="ai-stat-val">{e.calls}</span>
                    </span>
                    <span className="ai-stat-row">
                      <span className="ai-stat-label">Médio/chamada</span>
                      <span className="ai-stat-val">{fmtCents(avgCost)}</span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── 3. Uso por agente ────────────────────────────────────────── */}
      <section className="ai-section">
        <h3 className="ai-section-title">Uso por agente</h3>
        {uLoading ? (
          <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
        ) : !summary?.by_agent.length ? (
          <div className="ai-empty">Sem dados no período.</div>
        ) : (
          <table className="ai-agent-table">
            <thead>
              <tr>
                <th>Agente</th>
                <th>Chamadas</th>
                <th>Custo total</th>
                <th>Médio</th>
              </tr>
            </thead>
            <tbody>
              {summary.by_agent.map(a => (
                <tr key={a.agent}>
                  <td>{a.agent}</td>
                  <td>{a.calls}</td>
                  <td>{fmtCents(a.cost)}</td>
                  <td>{fmtCents(a.calls > 0 ? a.cost / a.calls : 0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><strong>Total</strong></td>
                <td><strong>{summary.total_calls}</strong></td>
                <td><strong>{fmtCents(summary.total_cost_usd)}</strong></td>
                <td>—</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>

      {/* ── 4. Histórico diário ──────────────────────────────────────── */}
      <section className="ai-section">
        <h3 className="ai-section-title">Histórico diário</h3>
        {uLoading ? (
          <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
        ) : (
          <DailyChart days={summary?.by_day ?? []} />
        )}
      </section>

      {/* ── 5. Motores disponíveis ───────────────────────────────────── */}
      <section className="ai-section">
        <h3 className="ai-section-title">Motores disponíveis</h3>
        {eLoading ? (
          <div className="skeleton" style={{ height: 60, borderRadius: 8 }} />
        ) : (
          <div className="ai-engine-list">
            {engines.map(e => (
              <div key={e.id} className="ai-engine-row">
                <div className="ai-engine-row-info">
                  <span className="ai-engine-row-name">{e.name}</span>
                  {usedEngines.has(e.slug) && (
                    <span className="ai-inuse-badge">em uso</span>
                  )}
                  <div className="ai-engine-caps" style={{ marginTop: 2 }}>
                    {e.capabilities.map(c => (
                      <span key={c} className="ai-cap-badge">{c}</span>
                    ))}
                  </div>
                </div>
                <div className="ai-engine-row-prices">
                  <span title="Custo por 1k tokens de input">
                    In: ${e.cost_per_1k_input_tokens.toFixed(4)}/1k
                  </span>
                  {e.cost_per_1k_output_tokens > 0 && (
                    <span title="Custo por 1k tokens de output">
                      Out: ${e.cost_per_1k_output_tokens.toFixed(4)}/1k
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
