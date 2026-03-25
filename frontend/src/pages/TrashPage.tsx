/**
 * TrashPage — lixeira por projeto (V1.5): soft delete, restaurar, exclusão permanente com confirmação.
 *
 * Leis respeitadas:
 * - delete_task HIGH / purge CRITICAL → confirmação explícita antes de remover do banco
 * - Dados via hooks useTrashTasks / mutations (api client com Conformity no backend onde aplicável)
 */
import { useState } from 'react'
import { useTrashTasks, useRestoreTask, usePurgeTaskPermanent } from '../hooks/useData'
import type { TrashTaskItem } from '../types'
import { toArr } from '../utils/array'

interface Props {
  activeProjectId: string | null
  projectName?: string
}

function formatDeletedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function TrashPage({ activeProjectId, projectName = '' }: Props) {
  const { data: raw, isLoading } = useTrashTasks(activeProjectId)
  const items = toArr<TrashTaskItem>(raw)
  const restore = useRestoreTask()
  const purge = usePurgeTaskPermanent()
  const [purgeTarget, setPurgeTarget] = useState<TrashTaskItem | null>(null)

  if (!activeProjectId) {
    return (
      <div className="empty-state trash-empty">
        <div className="empty-icon">🗑</div>
        <div className="empty-title">Selecione um projeto</div>
        <div className="empty-sub">A lixeira mostra tarefas removidas do board deste projeto.</div>
      </div>
    )
  }

  return (
    <div className="trash-page">
      <div className="main-header">
        <div>
          <div className="main-title">Lixeira</div>
          <div className="main-subtitle">
            {projectName ? `${projectName} · ${items.length} na lixeira` : `${items.length} na lixeira`}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="trash-skeleton-wrap">
          {[1, 2, 3].map(n => (
            <div key={n} className="skeleton trash-skeleton-row" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state trash-empty">
          <div className="empty-icon">✓</div>
          <div className="empty-title">Lixeira vazia</div>
          <div className="empty-sub">Tarefas excluídas do board aparecem aqui até restaurar ou apagar para sempre.</div>
        </div>
      ) : (
        <ul className="trash-list">
          {items.map(t => (
            <li key={t.id} className="trash-row">
              <div className="trash-row-main">
                <div className="trash-row-title">{t.title}</div>
                <div className="trash-row-meta">Excluída em {formatDeletedAt(t.deleted_at)}</div>
              </div>
              <div className="trash-row-actions">
                <button
                  type="button"
                  className="btn-confirm-sm"
                  disabled={restore.isPending || purge.isPending}
                  onClick={() => restore.mutate(t.id)}
                >
                  Restaurar
                </button>
                <button
                  type="button"
                  className="btn-cancel-sm trash-purge-trigger"
                  disabled={restore.isPending || purge.isPending}
                  onClick={() => setPurgeTarget(t)}
                >
                  Excluir permanentemente
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {purgeTarget && (
        <div className="trash-purge-overlay" role="dialog" aria-modal="true" aria-labelledby="trash-purge-title">
          <div className="trash-purge-card">
            <h3 id="trash-purge-title" className="trash-purge-title">Exclusão permanente</h3>
            <p className="trash-purge-text">
              A tarefa <strong>{purgeTarget.title}</strong> será removida do banco. Esta ação não pode ser desfeita
              (risco alto).
            </p>
            <div className="trash-purge-btns">
              <button type="button" className="btn-cancel-sm" onClick={() => setPurgeTarget(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-danger-sm"
                disabled={purge.isPending}
                onClick={() => {
                  purge.mutate(purgeTarget.id, {
                    onSuccess: () => setPurgeTarget(null),
                  })
                }}
              >
                {purge.isPending ? '…' : 'Confirmar exclusão permanente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
