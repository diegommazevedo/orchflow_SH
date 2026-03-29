/**
 * V2 — Sugestões do SchemaAgent (wizard HIGH em cada aplicar).
 */
import { useState } from 'react'
import type { SchemaSuggestion } from '../../types'
import { useSchemaApply } from '../../hooks/useV2'

interface Props {
  projectId: string
  suggestions: SchemaSuggestion[]
  onClose: () => void
  onApplied?: () => void
}

export function SchemaAgentPanel({ projectId, suggestions, onClose, onApplied }: Props) {
  const apply = useSchemaApply()
  const [wiz, setWiz] = useState<SchemaSuggestion | null>(null)

  return (
    <div className="sap-overlay" role="dialog" aria-modal>
      <div className="sap-card">
        <div className="sap-head">
          <h3>Sugestões do Schema Agent</h3>
          <button type="button" className="ks-x" onClick={onClose}>×</button>
        </div>
        {suggestions.length === 0 ? (
          <p className="ks-muted">Nenhuma sugestão no momento.</p>
        ) : (
          <ul className="sap-list">
            {suggestions.map(s => (
              <li key={s.id} className="sap-item">
                <div className="sap-item-title">{s.title}</div>
                <div className="sap-item-desc">{s.rationale}</div>
                <div className="sap-item-actions">
                  <button type="button" className="btn-cancel-sm" onClick={() => {}}>Ignorar</button>
                  <button type="button" className="btn-confirm-sm" onClick={() => setWiz(s)}>Aplicar…</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {wiz && (
        <div className="ts-wiz">
          <div className="ts-wiz-card">
            <h4>Confirmar alteração</h4>
            <p>{wiz.title}</p>
            <p className="ks-muted">{wiz.rationale}</p>
            <div className="ts-wiz-btns">
              <button type="button" className="btn-cancel-sm" onClick={() => setWiz(null)}>Voltar</button>
              <button
                type="button"
                className="btn-danger-sm"
                disabled={apply.isPending}
                onClick={() => {
                  apply.mutate(
                    { projectId, acceptedIds: [wiz.id], allSuggestions: suggestions },
                    {
                      onSuccess: () => {
                        setWiz(null)
                        onApplied?.()
                        onClose()
                      },
                    },
                  )
                }}
              >
                Aplicar alteração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
