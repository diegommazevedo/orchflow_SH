/**
 * V2 — Configuração de colunas Kanban do projeto.
 * Leis: não remover última coluna is_done (backend valida); wizard em remoção.
 */
import { useState } from 'react'
import { isAxiosError } from 'axios'
import { friendlyHttpStatus } from '../../services/api'
import {
  useKanbanColumns,
  usePatchKanbanColumn,
  useDeleteKanbanColumn,
  useCreateKanbanColumn,
  useReorderKanban,
} from '../../hooks/useV2'
import type { KanbanColumn } from '../../types'
import { TemplateWizard } from '../templates/TemplateWizard'
import { SchemaAgentWizard } from '../schema/SchemaAgentWizard'

interface Props {
  projectId: string
  onClose: () => void
}

export function KanbanSettings({ projectId, onClose }: Props) {
  const { data: cols = [], isLoading, refetch } = useKanbanColumns(projectId)
  const patchCol = usePatchKanbanColumn()
  const delCol   = useDeleteKanbanColumn()
  const createCol = useCreateKanbanColumn()
  const reorder   = useReorderKanban()

  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newColor, setNewColor] = useState('#7c6df0')
  const [purge, setPurge] = useState<KanbanColumn | null>(null)
  const [showTpl, setShowTpl] = useState(false)
  const [showSchema, setShowSchema] = useState(false)

  const sorted = [...cols].sort((a, b) => a.order - b.order)

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= sorted.length) return
    const next = [...sorted]
    const tmp = next[idx]
    next[idx] = next[j]
    next[j] = tmp
    reorder.mutate(
      { items: next.map((c, i) => ({ id: c.id, order: i })) },
      { onSuccess: () => refetch() },
    )
  }

  return (
    <div className="ks-overlay" role="dialog" aria-modal>
      <div className="ks-card">
        <div className="ks-head">
          <h3>Colunas do board</h3>
          <button type="button" className="ks-x" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        {isLoading ? <p className="ks-muted">Carregando…</p> : (
          <ul className="ks-list">
            {sorted.map((c, i) => (
              <li key={c.id} className="ks-row">
                <div className="ks-reorder">
                  <button type="button" className="ks-iconbtn" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className="ks-iconbtn" onClick={() => move(i, 1)} disabled={i === sorted.length - 1}>↓</button>
                </div>
                <input
                  className="ks-inp"
                  defaultValue={c.name}
                  onBlur={e => {
                    const v = e.target.value.trim()
                    if (v && v !== c.name) patchCol.mutate({ id: c.id, patch: { name: v } })
                  }}
                />
                <input
                  type="color"
                  className="ks-color"
                  defaultValue={c.color}
                  onBlur={e => patchCol.mutate({ id: c.id, patch: { color: e.target.value } })}
                />
                <label className="ks-toggle">
                  <input
                    type="checkbox"
                    checked={c.is_default}
                    onChange={e => patchCol.mutate({ id: c.id, patch: { is_default: e.target.checked } })}
                  />
                  padrão
                </label>
                <label className="ks-toggle">
                  <input
                    type="checkbox"
                    checked={c.is_done}
                    onChange={e => patchCol.mutate({ id: c.id, patch: { is_done: e.target.checked } })}
                  />
                  concluído
                </label>
                <button type="button" className="ks-del" onClick={() => setPurge(c)}>×</button>
              </li>
            ))}
          </ul>
        )}
        {!newOpen ? (
          <button type="button" className="btn-confirm-sm ks-add" onClick={() => setNewOpen(true)}>+ Nova coluna</button>
        ) : (
          <form
            className="ks-new"
            onSubmit={e => {
              e.preventDefault()
              if (!newName.trim() || !newSlug.trim()) return
              createCol.mutate(
                {
                  projectId,
                  name: newName.trim(),
                  slug: newSlug.trim(),
                  color: newColor,
                  order: sorted.length,
                  is_default: false,
                  is_done: false,
                },
                {
                  onSuccess: () => {
                    setNewOpen(false)
                    setNewName('')
                    setNewSlug('')
                    refetch()
                  },
                },
              )
            }}
          >
            <input className="cf-input" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)} />
            <input className="cf-input" placeholder="slug" value={newSlug} onChange={e => setNewSlug(e.target.value)} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} />
            <button type="submit" className="btn-confirm-sm">Criar</button>
            <button type="button" className="btn-cancel-sm" onClick={() => setNewOpen(false)}>Cancelar</button>
          </form>
        )}
        <p className="ks-hint">A última coluna marcada como &quot;concluído&quot; não pode ser removida.</p>
        <hr style={{ opacity: 0.2, margin: '12px 0' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-confirm-sm" onClick={() => setShowTpl(true)}>
            Templates de Vertical
          </button>
          <button type="button" className="btn-confirm-sm" onClick={() => setShowSchema(true)}>
            Análise de Schema (IA)
          </button>
        </div>
      </div>

      {purge && (
        <div className="ks-wiz">
          <div className="ks-wiz-card">
            <p>Remover coluna <strong>{purge.name}</strong>?</p>
            <div className="ks-wiz-btns">
              <button type="button" className="btn-cancel-sm" onClick={() => setPurge(null)}>Voltar</button>
              <button
                type="button"
                className="btn-danger-sm"
                onClick={() => {
                  delCol.mutate(purge.id, {
                    onSuccess: () => { setPurge(null); refetch() },
                    onError: (err: unknown) => {
                      const st = isAxiosError(err) ? err.response?.status : undefined
                      const raw = isAxiosError(err) ? err.response?.data : undefined
                      const detail =
                        raw && typeof raw === 'object' && raw !== null && 'detail' in raw
                          ? String((raw as { detail: unknown }).detail)
                          : ''
                      const msg =
                        st === 400 && detail
                          ? detail
                          : st != null
                            ? friendlyHttpStatus(st)
                            : 'Não foi possível remover a coluna.'
                      window.dispatchEvent(
                        new CustomEvent('orchflow:api-error', { detail: { message: msg } }),
                      )
                      setPurge(null)
                    },
                  })
                }}
              >
                Confirmar remoção
              </button>
            </div>
          </div>
        </div>
      )}

      {showTpl && (
        <TemplateWizard
          projectId={projectId}
          onClose={() => setShowTpl(false)}
          onApplied={() => refetch()}
        />
      )}
      {showSchema && (
        <SchemaAgentWizard
          projectId={projectId}
          onClose={() => setShowSchema(false)}
        />
      )}
    </div>
  )
}
