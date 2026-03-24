/**
 * TimelinePage — Vista cronológica simples agrupada por semana.
 *
 * Tasks sem prazo → seção "Sem data definida" no final.
 * Cores de prazo: mesma lógica do TaskCard.
 *
 * Leis respeitadas:
 * - Somente leitura: useTasks existente
 * - TaskDetailPanel reutilizado
 * - CORS não afetado
 */
import { useState, useMemo } from 'react'
import { useTasks } from '../hooks/useData'
import { TaskDetailPanel } from '../components/backlog/TaskDetailPanel'
import type { Task } from '../types'

interface Props {
  activeProjectId: string | null
}

const Q_COLOR: Record<string, string> = {
  q1: '#f43f5e', q2: '#f59e0b', q3: '#48cae4', q4: '#666688',
}

function calcDue(iso: string) {
  const due = new Date(iso + 'T12:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  let color: string, gap: string
  if (days < 0)       { color = '#f43f5e'; gap = `venceu há ${Math.abs(days)}d` }
  else if (days === 0) { color = '#f59e0b'; gap = 'hoje' }
  else if (days === 1) { color = '#f59e0b'; gap = 'amanhã' }
  else                 { color = 'var(--muted)'; gap = `em ${days}d` }
  return { display: new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR'), gap, color, days }
}

/** Retorna o início (segunda-feira) da semana ISO de uma data */
function weekStart(iso: string): Date {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay() || 7 // domingo → 7
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function weekKey(iso: string): string {
  return weekStart(iso).toISOString().slice(0, 10)
}

function weekLabel(key: string): string {
  const start = new Date(key + 'T12:00:00')
  const end   = new Date(key + 'T12:00:00')
  end.setDate(end.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const today    = new Date()
  const todayKey = weekKey(today.toISOString().slice(0, 10))
  let badge = ''
  if (key === todayKey) badge = ' — esta semana'
  else if (key < todayKey) badge = ' — passado'
  return `${fmt(start)} a ${fmt(end)}${badge}`
}

interface WeekGroup { key: string; label: string; tasks: Task[] }

export function TimelinePage({ activeProjectId }: Props) {
  const { data: tasks = [], isLoading } = useTasks(activeProjectId ?? undefined)
  const [detailTask, setDetailTask] = useState<Task | null>(null)

  const { groups, noDate } = useMemo(() => {
    const withDate = tasks.filter(t => !!t.due_date_iso).sort((a, b) =>
      (a.due_date_iso ?? '') < (b.due_date_iso ?? '') ? -1 : 1
    )
    const noDate = tasks.filter(t => !t.due_date_iso)

    const map = new Map<string, Task[]>()
    for (const t of withDate) {
      const k = weekKey(t.due_date_iso!)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(t)
    }
    const groups: WeekGroup[] = Array.from(map.entries())
      .sort(([a], [b]) => a < b ? -1 : 1)
      .map(([key, tasks]) => ({ key, label: weekLabel(key), tasks }))

    return { groups, noDate }
  }, [tasks])

  if (!activeProjectId) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">◷</div>
        <div className="empty-title">Selecione um projeto para ver a timeline</div>
      </div>
    )
  }

  if (isLoading) return <div className="loading-state">Carregando timeline…</div>

  const today = weekKey(new Date().toISOString().slice(0, 10))

  function TaskRow({ task }: { task: Task }) {
    const due = task.due_date_iso ? calcDue(task.due_date_iso) : null
    const qc  = Q_COLOR[task.quadrant] ?? '#666688'
    return (
      <div className="tl-task-row" onClick={() => setDetailTask(task)}
           role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && setDetailTask(task)}>
        <span className="tl-q-dot" style={{ background: qc }} title={task.quadrant.toUpperCase()} />
        <span className="tl-task-title">{task.title}</span>
        <span className={`tl-status-tag tl-status-${task.status}`}>
          {task.status.replace('_', ' ')}
        </span>
        {due && (
          <span className="tl-due" style={{ color: due.color }}>{due.display} · {due.gap}</span>
        )}
      </div>
    )
  }

  return (
    <div className="tl-wrapper">
      {groups.length === 0 && noDate.length === 0 ? (
        <div className="page-empty-state">
          <div className="empty-icon">◷</div>
          <div className="empty-title">Nenhuma task neste projeto</div>
        </div>
      ) : (
        <>
          {groups.map(g => {
            const isPast   = g.key < today
            const isCurrent = g.key === today
            return (
              <div key={g.key}
                   className={`tl-week${isCurrent ? ' tl-week-current' : ''}${isPast ? ' tl-week-past' : ''}`}>
                <div className="tl-week-header">
                  <span className="tl-week-label">{g.label}</span>
                  <span className="tl-week-count">{g.tasks.length}</span>
                  {isCurrent && <span className="tl-week-badge">hoje</span>}
                </div>
                <div className="tl-week-tasks">
                  {g.tasks.map(t => <TaskRow key={t.id} task={t} />)}
                </div>
              </div>
            )
          })}

          {noDate.length > 0 && (
            <div className="tl-week tl-week-nodate">
              <div className="tl-week-header">
                <span className="tl-week-label">Sem data definida</span>
                <span className="tl-week-count">{noDate.length}</span>
              </div>
              <div className="tl-week-tasks">
                {noDate.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </div>
          )}
        </>
      )}

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
