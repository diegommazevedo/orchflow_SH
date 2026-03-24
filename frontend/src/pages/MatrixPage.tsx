/**
 * MatrixPage — Vista Eisenhower 2×2 das tasks do projeto ativo.
 *
 * Leis respeitadas:
 * - Somente leitura: useTasks existente, zero mutações
 * - TaskDetailPanel reutilizado — lógica de edição não duplicada
 * - CORS não afetado
 */
import { useState } from 'react'
import { useTasks } from '../hooks/useData'
import { TaskDetailPanel } from '../components/backlog/TaskDetailPanel'
import type { Task, EisenhowerQuadrant } from '../types'

interface Props {
  activeProjectId: string | null
}

const QUADRANT_META: Record<EisenhowerQuadrant, {
  label: string
  sub: string
  color: string
  bg: string
}> = {
  q1: { label: 'Q1 — Urgente + Importante', sub: 'Fazer agora',    color: '#f43f5e', bg: '#f43f5e0e' },
  q2: { label: 'Q2 — Importante',           sub: 'Planejar',       color: '#f59e0b', bg: '#f59e0b0e' },
  q3: { label: 'Q3 — Urgente',              sub: 'Delegar',        color: '#48cae4', bg: '#48cae40e' },
  q4: { label: 'Q4 — Descarta',             sub: 'Eliminar',       color: '#666688', bg: '#66668808' },
}

const QUADRANT_ORDER: EisenhowerQuadrant[] = ['q1', 'q2', 'q3', 'q4']

function calcDueGap(iso?: string | null) {
  if (!iso) return null
  const due = new Date(iso + 'T12:00:00')
  if (isNaN(due.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  let color: string
  if (days < 0)        color = '#f43f5e'
  else if (days <= 1)  color = '#f59e0b'
  else                 color = 'var(--muted)'
  const gap = days < 0 ? `há ${Math.abs(days)}d` : days === 0 ? 'hoje' : days === 1 ? 'amanhã' : `em ${days}d`
  return { display: new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR'), gap, color }
}

function MatrixCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const due = calcDueGap(task.due_date_iso)
  return (
    <div className="mx-card" onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick()}>
      <div className="mx-card-title">{task.title}</div>
      <div className="mx-card-meta">
        <span className={`mx-status mx-status-${task.status}`}>{task.status.replace('_', ' ')}</span>
        {due && (
          <span className="mx-due" style={{ color: due.color }}>{due.display} · {due.gap}</span>
        )}
      </div>
    </div>
  )
}

function QuadrantCell({ quadrant, tasks, onOpenTask }: {
  quadrant: EisenhowerQuadrant
  tasks: Task[]
  onOpenTask: (t: Task) => void
}) {
  const meta = QUADRANT_META[quadrant]
  return (
    <div className="mx-cell" style={{ '--q-color': meta.color, '--q-bg': meta.bg } as React.CSSProperties}>
      <div className="mx-cell-header" style={{ borderColor: meta.color }}>
        <span className="mx-q-label" style={{ color: meta.color }}>{meta.label}</span>
        <span className="mx-q-sub">{meta.sub}</span>
        <span className="mx-q-count" style={{ background: meta.color + '22', color: meta.color }}>
          {tasks.length}
        </span>
      </div>
      <div className="mx-cell-body">
        {tasks.length === 0 ? (
          <div className="mx-empty">Sem tarefas neste quadrante</div>
        ) : (
          tasks.map(t => (
            <MatrixCard key={t.id} task={t} onClick={() => onOpenTask(t)} />
          ))
        )}
      </div>
    </div>
  )
}

export function MatrixPage({ activeProjectId }: Props) {
  const { data: tasks = [], isLoading } = useTasks(activeProjectId ?? undefined)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  if (!activeProjectId) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">◈</div>
        <div className="empty-title">Selecione um projeto para ver a matriz</div>
        <div className="empty-sub">A matriz Eisenhower organiza suas tasks por urgência e importância</div>
      </div>
    )
  }

  if (isLoading) return <div className="loading-state">Carregando matrix…</div>

  if (tasks.length === 0) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">◈</div>
        <div className="empty-title">Nenhuma tarefa classificada ainda</div>
        <div className="empty-sub">Mova tarefas do board para a matriz ou crie novas via chat</div>
      </div>
    )
  }

  const byQuadrant = (q: EisenhowerQuadrant) => tasks.filter(t => t.quadrant === q)

  return (
    <div className="mx-wrapper">
      <div className="mx-grid">
        {QUADRANT_ORDER.map(q => (
          <QuadrantCell
            key={q}
            quadrant={q}
            tasks={byQuadrant(q)}
            onOpenTask={setDetailTask}
          />
        ))}
      </div>

      {detailTask && (
        <TaskDetailPanel
          task={detailTask}
          onClose={() => setDetailTask(null)}
          onDeleted={() => setDetailTask(null)}
        />
      )}
    </div>
  )
}
