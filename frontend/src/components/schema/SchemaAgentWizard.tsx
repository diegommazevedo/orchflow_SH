import { useMemo, useState } from 'react'
import type { SchemaSuggestion } from '../../types'
import { useSchemaAgent } from '../../hooks/useV2'

interface Props {
  projectId: string
  onClose: () => void
}

export function SchemaAgentWizard({ projectId, onClose }: Props) {
  const { analyze, suggestions, loading, apply, applying, result } = useSchemaAgent(projectId)
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [highAck, setHighAck] = useState(false)

  const acceptedIds = useMemo(
    () => suggestions.filter(s => accepted[s.id]).map(s => s.id),
    [accepted, suggestions],
  )
  const acceptedHighCount = useMemo(
    () => suggestions.filter(s => accepted[s.id] && s.risk === 'HIGH').length,
    [accepted, suggestions],
  )

  async function runAnalyze() {
    const out = await analyze()
    const initial: Record<string, boolean> = {}
    out.suggestions.forEach(s => {
      initial[s.id] = false
    })
    setAccepted(initial)
    setConfirmOpen(false)
    setHighAck(false)
  }

  async function runApply() {
    await apply({ acceptedIds, allSuggestions: suggestions })
    setConfirmOpen(false)
    setHighAck(false)
  }

  return (
    <div className="ks-overlay" role="dialog" aria-modal>
      <div className="ks-card">
        <div className="ks-head">
          <h3>Análise de Schema (IA)</h3>
          <button type="button" className="ks-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button type="button" className="btn-confirm-sm" disabled={loading} onClick={runAnalyze}>
            {loading ? 'Analisando…' : 'Analisar schema'}
          </button>
          <button type="button" className="btn-cancel-sm" onClick={onClose}>Cancelar</button>
        </div>

        {suggestions.length > 0 && (
          <>
            <ul className="sap-list">
              {suggestions.map((s: SchemaSuggestion) => {
                const riskColor = s.risk === 'HIGH' ? '#dc2626' : s.risk === 'MEDIUM' ? '#d97706' : '#16a34a'
                return (
                  <li key={s.id} className="sap-item">
                    <div className="sap-item-title">{s.title}</div>
                    <div className="sap-item-desc">{s.rationale}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                      <span style={{ color: riskColor, fontWeight: 700 }}>{s.risk}</span>
                      <label className="ks-toggle">
                        <input
                          type="checkbox"
                          checked={!!accepted[s.id]}
                          onChange={e => setAccepted(prev => ({ ...prev, [s.id]: e.target.checked }))}
                        />
                        aceitar
                      </label>
                      {s.risk === 'HIGH' && <span className="ks-muted">Ação destrutiva — confirme manualmente</span>}
                    </div>
                  </li>
                )
              })}
            </ul>

            <p className="ks-hint">
              {acceptedIds.length} aceitas / {suggestions.length - acceptedIds.length} rejeitadas
            </p>

            <button
              type="button"
              className="btn-danger-sm"
              disabled={acceptedIds.length === 0 || applying}
              onClick={() => setConfirmOpen(true)}
            >
              Aplicar aceitas
            </button>
          </>
        )}

        {result && (
          <div className="ts-wiz-card" style={{ marginTop: 12 }}>
            <p>Aplicadas: {result.applied}</p>
            <p>Puladas por lei: {result.skipped_due_to_law}</p>
            {result.errors.length > 0 && <p>Erros: {result.errors.join(' | ')}</p>}
          </div>
        )}
      </div>

      {confirmOpen && (
        <div className="ks-wiz">
          <div className="ks-wiz-card">
            <p>
              Você aceitou {acceptedIds.length} sugestões, incluindo {acceptedHighCount} destrutivas. Confirmar?
            </p>
            {acceptedHighCount > 0 && (
              <label className="ks-toggle">
                <input type="checkbox" checked={highAck} onChange={e => setHighAck(e.target.checked)} />
                Confirmo que li os riscos HIGH
              </label>
            )}
            <div className="ks-wiz-btns">
              <button type="button" className="btn-cancel-sm" onClick={() => setConfirmOpen(false)}>Voltar</button>
              <button
                type="button"
                className="btn-danger-sm"
                disabled={applying || (acceptedHighCount > 0 && !highAck)}
                onClick={runApply}
              >
                Confirmar aplicação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
