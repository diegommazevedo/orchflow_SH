/**
 * V2 — Escolher e aplicar template de vertical (wizard de confirmação).
 */
import { useState } from 'react'
import { useVerticalTemplates, useApplyTemplate } from '../../hooks/useV2'

interface Props {
  projectId: string
  onClose: () => void
  onApplied?: () => void
}

export function TemplateSelector({ projectId, onClose, onApplied }: Props) {
  const { data: list = [], isLoading } = useVerticalTemplates()
  const apply = useApplyTemplate()
  const [pick, setPick] = useState<string | null>(null)
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null)

  const sel = list.find(t => t.slug === pick)

  return (
    <div className="ts-overlay" role="dialog" aria-modal>
      <div className="ts-card">
        <h3 className="ts-title">Qual é o tipo deste projeto?</h3>
        <p className="ts-sub">Templates sugerem campos e colunas — você confirma antes de aplicar.</p>
        {isLoading ? <p>Carregando…</p> : (
          <div className="ts-grid">
            {list.map(t => (
              <button
                key={t.slug}
                type="button"
                className={`ts-tile${pick === t.slug ? ' ts-tile-active' : ''}`}
                onClick={() => setPick(t.slug)}
              >
                <div className="ts-tile-name">{t.name}</div>
                <div className="ts-tile-desc">{t.description ?? '—'}</div>
              </button>
            ))}
          </div>
        )}
        <div className="ts-actions">
          <button type="button" className="btn-cancel-sm" onClick={onClose}>Pular</button>
          <button
            type="button"
            className="btn-confirm-sm"
            disabled={!pick}
            onClick={() => setConfirmSlug(pick)}
          >
            Aplicar…
          </button>
        </div>
      </div>

      {confirmSlug && sel && (
        <div className="ts-wiz">
          <div className="ts-wiz-card">
            <h4>Confirmar template</h4>
            <p>Aplicar <strong>{sel.name}</strong> a este projeto? Serão adicionados campos e colunas que ainda não existem.</p>
            <div className="ts-wiz-btns">
              <button type="button" className="btn-cancel-sm" onClick={() => setConfirmSlug(null)}>Voltar</button>
              <button
                type="button"
                className="btn-confirm-sm"
                disabled={apply.isPending}
                onClick={() => {
                  const t = list.find(x => x.slug === confirmSlug)
                  if (!t) return
                  apply.mutate(
                    { templateId: t.id, projectId },
                    { onSuccess: () => { onApplied?.(); onClose() } },
                  )
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
