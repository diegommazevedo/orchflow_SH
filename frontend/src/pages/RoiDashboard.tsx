import { useState } from 'react'
import { useRoiSummary, useRoiTimeline } from '../hooks/useRoi'
import type { RoiDueItem, RoiProjectStat, RoiTimelineDay } from '../types'
import type { Project } from '../types'

// ── Utilidades ────────────────────────────────────────────────────────────────

function fmtMinutes(m: number): string {
  if (m < 60) return `${m}min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h}h ${rem}min` : `${h}h`
}

function focusBg(color: string): string {
  return color === 'green' ? '#5eead420' : color === 'amber' ? '#f59e0b20' : '#f43f5e20'
}
function focusBorder(color: string): string {
  return color === 'green' ? '#5eead440' : color === 'amber' ? '#f59e0b40' : '#f43f5e40'
}
function focusText(color: string): string {
  return color === 'green' ? '#5eead4' : color === 'amber' ? '#f59e0b' : '#f43f5e'
}

const Q_COLOR: Record<string, string> = {
  q1: '#f43f5e',
  q2: '#7c6df0',
  q3: '#f59e0b',
  q4: '#4a4a6a',
}
const Q_SHORT: Record<string, string> = {
  q1: 'Q1 Urgente+Importante',
  q2: 'Q2 Importante',
  q3: 'Q3 Urgente',
  q4: 'Q4 Baixa prioridade',
}

// ── Componentes ───────────────────────────────────────────────────────────────

function FocusScore({ pct, label, color }: { pct: number; label: string; color: string }) {
  return (
    <div
      className="roi-card roi-focus-card"
      style={{ background: focusBg(color), borderColor: focusBorder(color) }}
    >
      <div className="roi-card-label">Focus Score</div>
      <div className="roi-focus-number" style={{ color: focusText(color) }}>{pct}%</div>
      <div className="roi-focus-label" style={{ color: focusText(color) }}>{label}</div>
      <div className="roi-focus-hint">
        % do tempo investido em Q2 — estratégico, não urgente
      </div>
    </div>
  )
}

function QuadrantBars({ data }: { data: Record<string, { pct: number; hours: number; label: string }> }) {
  const quads = ['q1', 'q2', 'q3', 'q4']
  return (
    <div className="roi-card">
      <div className="roi-card-label">Tempo por quadrante</div>
      <div className="roi-bars">
        {quads.map(q => {
          const d = data[q]
          return (
            <div key={q} className="roi-bar-row">
              <div className="roi-bar-label">
                <span className="roi-q-dot" style={{ background: Q_COLOR[q] }} />
                {Q_SHORT[q]}
              </div>
              <div className="roi-bar-track">
                <div
                  className="roi-bar-fill"
                  style={{
                    width: `${d?.pct ?? 0}%`,
                    background: Q_COLOR[q],
                  }}
                />
              </div>
              <div className="roi-bar-val">
                {d?.pct ?? 0}%
                <span className="roi-bar-sub">{d ? fmtMinutes(d.hours * 60) : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProjectBars({ data }: { data: RoiProjectStat[] }) {
  const max = Math.max(1, ...data.map(p => p.minutes))
  return (
    <div className="roi-card">
      <div className="roi-card-label">Tempo por projeto</div>
      {data.length === 0 && <div className="roi-empty">Nenhum tempo registrado ainda.</div>}
      <div className="roi-bars">
        {data.map(p => (
          <div key={p.project_id} className="roi-bar-row">
            <div className="roi-bar-label" title={p.name}>
              <span className="roi-proj-dot" />
              {p.name}
            </div>
            <div className="roi-bar-track">
              <div
                className="roi-bar-fill"
                style={{
                  width: `${Math.round((p.minutes / max) * 100)}%`,
                  background: '#7c6df0',
                }}
              />
            </div>
            <div className="roi-bar-val">
              {fmtMinutes(p.minutes)}
              <span className="roi-bar-sub">{p.tasks_done}/{p.tasks_total} ✓</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusSnapshot({ data }: { data: Record<string, number> }) {
  const items = [
    { key: 'backlog',     label: 'Backlog',      color: '#4a4a6a' },
    { key: 'in_progress', label: 'Em andamento', color: '#7c6df0' },
    { key: 'done',        label: 'Concluídas',   color: '#5eead4' },
  ]
  return (
    <div className="roi-card">
      <div className="roi-card-label">Status do backlog</div>
      <div className="roi-status-row">
        {items.map(({ key, label, color }) => (
          <div key={key} className="roi-status-item">
            <div className="roi-status-n" style={{ color }}>{data[key] ?? 0}</div>
            <div className="roi-status-label">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function VelocityCard({ week, month }: { week: number; month: number }) {
  return (
    <div className="roi-card">
      <div className="roi-card-label">Velocidade</div>
      <div className="roi-velocity-row">
        <div className="roi-vel-block">
          <div className="roi-vel-n">{week}</div>
          <div className="roi-vel-label">esta semana</div>
        </div>
        <div className="roi-vel-divider" />
        <div className="roi-vel-block">
          <div className="roi-vel-n">{month}</div>
          <div className="roi-vel-label">este mês</div>
        </div>
      </div>
      <div className="roi-vel-hint">tarefas concluídas</div>
    </div>
  )
}

function DueCard({ overdue, approaching }: { overdue: RoiDueItem[]; approaching: RoiDueItem[] }) {
  function dayLabel(days: number) {
    if (days < 0) return `${Math.abs(days)}d atrasado`
    if (days === 0) return 'hoje'
    if (days === 1) return 'amanhã'
    return `em ${days}d`
  }
  const all = [
    ...overdue.map(d => ({ ...d, type: 'overdue' as const })),
    ...approaching.map(d => ({ ...d, type: 'approaching' as const })),
  ]
  return (
    <div className="roi-card">
      <div className="roi-card-label">
        Prazos em risco
        {overdue.length > 0 && (
          <span className="roi-overdue-badge">{overdue.length} atrasadas</span>
        )}
      </div>
      {all.length === 0 ? (
        <div className="roi-empty">Nenhum prazo em risco. ✓</div>
      ) : (
        <div className="roi-due-list">
          {all.map(item => (
            <div key={item.task_id} className={`roi-due-item roi-due-${item.type}`}>
              <div className="roi-due-title">{item.title}</div>
              <div className="roi-due-meta">
                <span className="roi-due-q" style={{ color: Q_COLOR[item.quadrant] }}>
                  {item.quadrant.toUpperCase()}
                </span>
                <span className={`roi-due-day${item.type === 'overdue' ? ' roi-due-day-red' : ''}`}>
                  {dayLabel(item.days)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Sparkline({ days }: { days: RoiTimelineDay[] }) {
  const last7 = days.slice(-7)
  const maxMin = Math.max(1, ...last7.map(d => d.minutes))
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="roi-card roi-spark-card">
      <div className="roi-card-label">Últimos 7 dias — atividade</div>
      <div className="roi-spark">
        {last7.map(d => {
          const h = Math.round((d.minutes / maxMin) * 48)
          const isToday = d.date === today
          return (
            <div key={d.date} className="roi-spark-col" title={`${d.date}: ${fmtMinutes(d.minutes)}, ${d.tasks_done} concluídas`}>
              <div className="roi-spark-bar-wrap">
                <div
                  className={`roi-spark-bar${isToday ? ' roi-spark-bar-today' : ''}`}
                  style={{ height: `${h}px` }}
                />
              </div>
              <div className="roi-spark-day">
                {new Date(d.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── RoiDashboard principal ────────────────────────────────────────────────────

interface Props {
  projects: Project[]
  activeProjectId: string | null
}

export function RoiDashboard({ projects, activeProjectId }: Props) {
  const [filterProject, setFilterProject] = useState<string>('')

  const projectId = filterProject || null
  const { data: summary, isLoading } = useRoiSummary(projectId)
  const { data: timeline } = useRoiTimeline(30, projectId)

  return (
    <div className="roi-dashboard">
      <div className="roi-header">
        <div>
          <h1 className="roi-title">Dashboard ROI</h1>
          <p className="roi-subtitle">// estou investindo meu tempo no lugar certo?</p>
        </div>
        <select
          className="roi-filter"
          value={filterProject}
          onChange={e => setFilterProject(e.target.value)}
        >
          <option value="">Todos os projetos</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="loading-state">Calculando métricas…</div>
      ) : !summary ? (
        <div className="empty-state">
          <div className="empty-icon">◈</div>
          <div className="empty-title">Sem dados ainda</div>
          <div className="empty-sub">Registre tempo nas tarefas para ver o ROI</div>
        </div>
      ) : (
        <div className="roi-grid">
          {/* Linha 1 — métricas principais */}
          <FocusScore
            pct={summary.focus_score_pct}
            label={summary.focus_label}
            color={summary.focus_color}
          />
          <StatusSnapshot data={summary.tasks_by_status} />
          <VelocityCard
            week={summary.velocity.done_this_week}
            month={summary.velocity.done_this_month}
          />

          {/* Linha 2 — barras */}
          <div className="roi-col-wide">
            <QuadrantBars
              data={Object.fromEntries(
                Object.entries(summary.time_by_quadrant).map(([k, v]) => [k, v])
              )}
            />
          </div>
          <div className="roi-col-wide">
            <ProjectBars data={summary.time_by_project} />
          </div>

          {/* Linha 3 — prazos + sparkline */}
          <div className="roi-col-wide">
            <DueCard overdue={summary.overdue} approaching={summary.approaching} />
          </div>
          {timeline && (
            <div className="roi-col-wide">
              <Sparkline days={timeline.days} />
            </div>
          )}

          {/* Total de tempo */}
          <div className="roi-card roi-total-card">
            <div className="roi-card-label">Tempo total registrado</div>
            <div className="roi-total-n">{summary.total_time_hours}h</div>
            <div className="roi-total-sub">em {summary.tasks_total} tarefas</div>
          </div>
        </div>
      )}
    </div>
  )
}
