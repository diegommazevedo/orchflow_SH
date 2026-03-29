/**
 * Frente 3 — Wizard MEDIUM: preview de colunas/campos, aviso, confirmação, resultado.
 */
import { useState } from 'react'
import type { ApplyTemplateResult, VerticalTemplate } from '../../types'
import { useVerticalTemplates, useTemplateDetail, useApplyTemplate } from '../../hooks/useV2'

type Step = 'pick' | 'preview' | 'done'

interface Props {
  projectId: string
  onClose: () => void
  onApplied?: () => void
}

function colList(t: VerticalTemplate | undefined) {
  const k = t?.kanban_columns ?? t?.columns ?? []
  return Array.isArray(k) ? k : []
}

function fieldList(t: VerticalTemplate | undefined) {
  const f = t?.custom_fields ?? []
  return Array.isArray(f) ? f : []
}

export function TemplateWizard({ projectId, onClose, onApplied }: Props) {
  const { data: list = [], isLoading } = useVerticalTemplates()
  const [step, setStep] = useState<Step>('pick')
  const [pickId, setPickId] = useState<string | null>(null)
  const { data: detail, isLoading: loadingDetail } = useTemplateDetail(pickId)
  const apply = useApplyTemplate()
  const [result, setResult] = useState<ApplyTemplateResult | null>(null)

  const sel = list.find((x: VerticalTemplate) => x.id === pickId)

  return (
    <div className="ts-overlay twiz-overlay" role="dialog" aria-modal>
      <div className="ts-card twiz-card">
        <div className="twiz-head">
          <h3 className="ts-title">Templates de vertical</h3>
          <button type="button" className="ks-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        {step === 'pick' && (
          <>
            <p className="ts-sub">Escolha um template. Na próxima etapa você vê o que será adicionado.</p>
            {isLoading ? <p>Carregando…</p> : (
              <div className="ts-grid">
                {list.map((t: VerticalTemplate) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`ts-tile${pickId === t.id ? ' ts-tile-active' : ''}`}
                    onClick={() => setPickId(t.id)}
                  >
                    <div className="ts-tile-name">{t.name}</div>
                    <div className="ts-tile-desc">{t.description ?? '—'}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="ts-actions">
              <button type="button" className="btn-cancel-sm" onClick={onClose}>Cancelar</button>
              <button
                type="button"
                className="btn-confirm-sm"
                disabled={!pickId}
                onClick={() => setStep('preview')}
              >
                Próximo
              </button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <p className="twiz-warn">
              <strong>Colunas e campos que já existem no projeto não serão alterados</strong> — só entram itens novos (slugs novos).
            </p>
            {loadingDetail ? <p>Carregando preview…</p> : (
              <>
                <h4 className="twiz-subh">Preview — {sel?.name}</h4>
                <div className="twiz-preview">
                  <div>
                    <div className="twiz-label">Colunas Kanban</div>
                    <ul className="twiz-ul">
                      {colList(detail).map((c, i) => (
                        <li key={`${c.slug}-${i}`}>{c.name} <span className="twiz-muted">({c.slug})</span></li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="twiz-label">Campos customizados</div>
                    <ul className="twiz-ul">
                      {fieldList(detail).map((f, i) => (
                        <li key={`${f.name}-${i}`}>
                          {f.label ?? f.name} <span className="twiz-muted">· {f.field_type}</span>
                          {f.required ? <span className="twiz-req"> obrigatório</span> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
            <div className="ts-actions">
              <button type="button" className="btn-cancel-sm" onClick={() => setStep('pick')}>Voltar</button>
              <button
                type="button"
                className="btn-confirm-sm"
                disabled={!pickId || apply.isPending}
                onClick={() => {
                  if (!pickId) return
                  apply.mutate(
                    { projectId, templateId: pickId },
                    {
                      onSuccess: (r) => {
                        setResult(r)
                        setStep('done')
                        onApplied?.()
                      },
                    },
                  )
                }}
              >
                Aplicar template
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <>
            <h4 className="twiz-subh">Template aplicado</h4>
            <ul className="twiz-result">
              <li><strong>{result.columns_added}</strong> coluna(s) adicionada(s)</li>
              <li><strong>{result.fields_added}</strong> campo(s) adicionado(s)</li>
              <li>
                Ignorados (já existiam): <strong>{result.skipped.length}</strong>
                {result.skipped.length > 0 ? (
                  <ul className="twiz-skipped">
                    {result.skipped.map(s => <li key={s}>{s}</li>)}
                  </ul>
                ) : null}
              </li>
            </ul>
            <div className="ts-actions">
              <button type="button" className="btn-confirm-sm" onClick={onClose}>Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
