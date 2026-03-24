/**
 * ListView — Vista em tabela das tasks do projeto ativo.
 *
 * Leis respeitadas:
 * - Somente leitura: useTasks existente, zero mutações
 * - TaskDetailPanel reutilizado
 * - CORS não afetado
 */
import { useState, useMemo } from 'react'
import { useTasks } from '../hooks/useData'
import { TaskDetailPanel } from '../components/backlog/TaskDetailPanel'
import { ExportMenu } from '../components/ui/ExportMenu'
import type { Task, EisenhowerQuadrant, TaskStatus } from '../types'

interface Props {
  activeProjectId: string | null
  projectName?: string
}

type SortCol = 'title' | 'quadrant' | 'status' | 'due_date' | 'time'
type SortDir = 'asc' | 'desc'

const Q_COLOR: Record<EisenhowerQuadrant, string> = {
  q1: '#f43f5e', q2: '#f59e0b', q3: '#48cae4', q4: '#666688',
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog', in_progress: 'Em andamento', blocked: 'Impedimento', done: 'Concluído',
}

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: '#4a4a6a', in_progress: '#7c6df0', blocked: '#f43f5e', done: '#5eead4',
}

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

function timeLabel(mins: number): string {
  if (mins === 0) return '—'
  const h = Math.floor(mins / 60); const m = mins % 60
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: SortDir }) {
  if (!active) return <span className="lv-sort-icon lv-sort-idle">⇅</span>
  return <span className="lv-sort-icon lv-sort-active">{dir === 'asc' ? '↑' : '↓'}</span>
}

export function ListView({ activeProjectId, projectName = '' }: Props) {
  const { data: tasks = [], isLoading } = useTasks(activeProjectId ?? undefined)
  const [detailTask, setDetailTask] = useState<Task | null>(null)
  const [sortCol, setSortCol] = useState<SortCol>('title')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'all'>('all')
  const [filterQuadrant, setFilterQuadrant] = useState<EisenhowerQuadrant | 'all'>('all')

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = [...tasks]
    if (filterStatus !== 'all') list = list.filter(t => t.status === filterStatus)
    if (filterQuadrant !== 'all') list = list.filter(t => t.quadrant === filterQuadrant)

    list.sort((a, b) => {
      let va: string | number = '', vb: string | number = ''
      if (sortCol === 'title')     { va = a.title.toLowerCase(); vb = b.title.toLowerCase() }
      if (sortCol === 'quadrant')  { va = a.quadrant;  vb = b.quadrant }
      if (sortCol === 'status')    { va = a.status;    vb = b.status }
      if (sortCol === 'due_date')  { va = a.due_date_iso ?? 'zzz'; vb = b.due_date_iso ?? 'zzz' }
      if (sortCol === 'time')      { va = a.time_spent_minutes; vb = b.time_spent_minutes }
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [tasks, filterStatus, filterQuadrant, sortCol, sortDir])

  if (!activeProjectId) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">≡</div>
        <div className="empty-title">Selecione um projeto para ver a lista</div>
      </div>
    )
  }

  if (isLoading) return <div className="loading-state">Carregando lista…</div>

  if (tasks.length === 0) {
    return (
      <div className="page-empty-state">
        <div className="empty-icon">≡</div>
        <div className="empty-title">Lista vazia</div>
        <div className="empty-sub">Crie tarefas via chat, importe uma planilha ou arraste do board</div>
        <button className="empty-action-btn" onClick={() => window.dispatchEvent(new CustomEvent('orchflow:focus-chat'))}>
          + Nova tarefa via chat
        </button>
      </div>
    )
  }

  function th(col: SortCol, label: string) {
    return (
      <th className="lv-th lv-th-sortable" onClick={() => toggleSort(col)}>
        {label}
        <SortIcon col={col} active={sortCol === col} dir={sortDir} />
      </th>
    )
  }

  return (
    <div className="lv-wrapper">
      {/* Filtros + ExportMenu */}
      <div className="lv-filters">
        <label className="lv-filter-label">Status:</label>
        <select className="lv-filter-select" value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as TaskStatus | 'all')}>
          <option value="all">Todos</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>

        <label className="lv-filter-label">Quadrante:</label>
        <select className="lv-filter-select" value={filterQuadrant}
                onChange={e => setFilterQuadrant(e.target.value as EisenhowerQuadrant | 'all')}>
          <option value="all">Todos</option>
          <option value="q1">Q1</option>
          <option value="q2">Q2</option>
          <option value="q3">Q3</option>
          <option value="q4">Q4</option>
        </select>

        <span className="lv-count">{filtered.length} task{filtered.length !== 1 ? 's' : ''}</span>

        {activeProjectId && projectName && (
          <div className="lv-export">
            <ExportMenu projectId={activeProjectId} projectName={projectName} />
          </div>
        )}
      </div>

      <div className="lv-table-wrap">
        <table className="lv-table">
          <thead>
            <tr>
              {th('title', 'Título')}
              {th('quadrant', 'Quadrante')}
              {th('status', 'Status')}
              <th className="lv-th">Responsável</th>
              {th('due_date', 'Prazo')}
              {th('time', 'Tempo')}
              <th className="lv-th lv-th-actions">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="lv-empty">Nenhuma task com este filtro</td></tr>
            ) : filtered.map(task => {
              const due = calcDueGap(task.due_date_iso)
              const qc  = Q_COLOR[task.quadrant] ?? '#666688'
              const sc  = STATUS_COLOR[task.status as TaskStatus] ?? '#4a4a6a'
              return (
                <tr key={task.id} className="lv-row" onClick={() => setDetailTask(task)}>
                  <td className="lv-td lv-td-title">{task.title}</td>
                  <td className="lv-td">
                    <span className="lv-q-pill" style={{ background: qc + '20', color: qc, border: `1px solid ${qc}30` }}>
                      {task.quadrant.toUpperCase()}
                    </span>
                  </td>
                  <td className="lv-td">
                    <span className="lv-status-badge" style={{ background: sc + '20', color: sc }}>
                      {STATUS_LABEL[task.status as TaskStatus] ?? task.status}
                    </span>
                  </td>
                  <td className="lv-td lv-td-muted">{task.assignee_id ? '—' : '—'}</td>
                  <td className="lv-td">
                    {due ? (
                      <span style={{ color: due.color }}>
                        {due.display}
                        <br />
                        <small>{due.gap}</small>
                      </span>
                    ) : '—'}
                  </td>
                  <td className="lv-td lv-td-muted">{timeLabel(task.time_spent_minutes)}</td>
                  <td className="lv-td lv-td-actions" onClick={e => e.stopPropagation()}>
                    <button className="lv-action-btn"
                            onClick={() => setDetailTask(task)}
                            title="Editar">✎</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
