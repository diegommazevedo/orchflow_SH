/**
 * DashboardPage — Dashboard ROI com dados reais do banco.
 *
 * Sprint 6A: 5 blocos visuais em SVG puro (zero libs de gráfico).
 *   Bloco 1 — 4 KPI cards
 *   Bloco 2 — Gráfico de barras 14 dias (SVG)
 *   Bloco 3 — Donut quadrantes (SVG)
 *   Bloco 4 — Lista de projetos com progresso
 *   Bloco 5 — Heatmap 90 dias estilo GitHub (SVG)
 *
 * Leis respeitadas:
 *   - SVG puro — zero recharts/chartjs
 *   - Somente leitura — nenhuma mutação
 *   - Analytics calculado no backend
 *   - CORS mantido
 */
import { useState } from 'react'
import { useRoiData, useHeatmap } from '../hooks/useAnalytics'
import type { DailyFocus, ProjectRoi, HeatmapDay } from '../types'

// ── Constantes de cor ─────────────────────────────────────────────────────────
const Q_COLORS: Record<string, string> = {
  q1: '#f43f5e',
  q2: '#f59e0b',
  q3: '#48cae4',
  q4: '#444455',
}
const Q_LABELS: Record<string, string> = {
  q1: 'Q1 — Urgente',
  q2: 'Q2 — Importante',
  q3: 'Q3 — Delegável',
  q4: 'Q4 — Baixo impacto',
}
const MOOD_COLOR: Record<string, string> = {
  flow:    'var(--accent2)',
  ok:      'var(--accent)',
  blocked: 'var(--red)',
}
const HEAT_COLORS = [
  'var(--surface2)',      // 0 min
  '#7c6df030',            // 1-30 min
  '#7c6df060',            // 31-60 min
  '#7c6df090',            // 61-120 min
  'var(--accent)',        // 120+ min
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMin(m: number): string {
  const h = Math.floor(m / 60); const min = m % 60
  if (h > 0 && min > 0) return `${h}h ${min}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}
function heatColor(m: number): string {
  if (m === 0) return HEAT_COLORS[0]
  if (m <= 30) return HEAT_COLORS[1]
  if (m <= 60) return HEAT_COLORS[2]
  if (m <= 120) return HEAT_COLORS[3]
  return HEAT_COLORS[4]
}
function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  } catch { return iso }
}
function dayOfWeek(iso: string): number {
  try { return new Date(iso + 'T12:00:00').getDay() } catch { return 0 }
}

// ── Bloco 1 — KPI Cards ───────────────────────────────────────────────────────
interface KpiCardProps { icon: string; value: string; label: string; sub?: string; accent?: boolean }
function KpiCard({ icon, value, label, sub, accent }: KpiCardProps) {
  return (
    <div className={`db-kpi-card${accent ? ' db-kpi-accent' : ''}`}>
      <span className="db-kpi-icon">{icon}</span>
      <div className="db-kpi-body">
        <div className="db-kpi-value">{value}</div>
        <div className="db-kpi-label">{label}</div>
        {sub && <div className="db-kpi-sub">{sub}</div>}
      </div>
    </div>
  )
}

// ── Bloco 2 — Gráfico de barras ────────────────────────────────────────────────
function BarChart({ data }: { data: DailyFocus[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: DailyFocus } | null>(null)

  const maxMin = Math.max(...data.map(d => d.minutes), 1)
  const W = 560; const H = 160; const PAD_L = 36; const PAD_B = 28
  const chartW = W - PAD_L; const chartH = H - PAD_B
  const barW   = Math.floor(chartW / data.length) - 4

  // Y axis ticks em horas
  const maxH = maxMin / 60
  const yTick = maxH <= 1 ? 0.5 : maxH <= 2 ? 1 : maxH <= 4 ? 2 : Math.ceil(maxH / 3)
  const yTicks = []
  for (let h = 0; h <= maxH; h += yTick) yTicks.push(h)

  return (
    <div className="db-chart-wrap" style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="db-bar-svg" preserveAspectRatio="none">
        {/* Y grid lines */}
        {yTicks.map(h => {
          const y = PAD_B + chartH - (h / maxH) * chartH - PAD_B / 2 + PAD_B / 2
          const yPos = H - PAD_B - (h / (maxMin / 60)) * chartH
          return (
            <g key={h}>
              <line x1={PAD_L} x2={W} y1={yPos} y2={yPos}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" />
              <text x={PAD_L - 4} y={yPos + 3} textAnchor="end"
                fontSize={9} fill="var(--muted)">{h}h</text>
            </g>
          )
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.minutes / maxMin) * chartH
          const x    = PAD_L + i * (chartW / data.length) + 2
          const y    = H - PAD_B - barH
          const color = d.mood ? (MOOD_COLOR[d.mood] ?? 'var(--border2)') : 'var(--border2)'
          return (
            <g key={d.date}>
              <rect
                x={x} y={y} width={barW} height={Math.max(barH, 2)}
                rx={2} fill={color} opacity={0.85}
                className="db-bar-rect"
                onMouseEnter={e => setTooltip({
                  x: e.clientX, y: e.clientY, d,
                })}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* X label — mostrar só 1 de cada 2 para não sobrepor */}
              {i % 2 === 0 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle"
                  fontSize={8} fill="var(--muted)">{fmtDate(d.date)}</text>
              )}
            </g>
          )
        })}

        {/* X axis */}
        <line x1={PAD_L} x2={W} y1={H - PAD_B} y2={H - PAD_B}
          stroke="var(--border)" strokeWidth={1} />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="db-tooltip"
          style={{ top: tooltip.y - 60, left: tooltip.x + 12 }}
        >
          <div className="db-tooltip-date">{fmtDate(tooltip.d.date)}</div>
          <div className="db-tooltip-val">{fmtMin(tooltip.d.minutes)}</div>
          {tooltip.d.mood && (
            <div className="db-tooltip-mood" style={{ color: MOOD_COLOR[tooltip.d.mood] }}>
              {tooltip.d.mood === 'flow' ? '🔥 no flow'
               : tooltip.d.mood === 'ok' ? '😐 ok'
               : '😤 bloqueado'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Bloco 3 — Donut quadrantes ─────────────────────────────────────────────────
function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg - 90) * Math.PI / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  if (end - start >= 360) end = start + 359.99
  const s = polarToCartesian(cx, cy, r, end)
  const e = polarToCartesian(cx, cy, r, start)
  const large = end - start > 180 ? 1 : 0
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`
}

function DonutChart({ dist, total }: { dist: Record<string, number>; total: number }) {
  const [hovQ, setHovQ] = useState<string | null>(null)
  const CX = 90; const CY = 90; const R = 62; const SW = 26
  const quads = ['q1', 'q2', 'q3', 'q4']
  const sum = quads.reduce((s, q) => s + (dist[q] ?? 0), 0) || 1

  let cursor = 0
  const segments = quads.map(q => {
    const val   = dist[q] ?? 0
    const deg   = (val / sum) * 360
    const start = cursor
    cursor += deg
    return { q, val, start, end: cursor }
  })

  return (
    <div className="db-donut-wrap">
      <svg viewBox="0 0 180 180" className="db-donut-svg">
        {segments.map(seg => (
          <path
            key={seg.q}
            d={arcPath(CX, CY, R, seg.start, seg.end)}
            fill="none"
            stroke={Q_COLORS[seg.q]}
            strokeWidth={hovQ === seg.q ? SW + 4 : SW}
            strokeLinecap="butt"
            opacity={hovQ && hovQ !== seg.q ? 0.4 : 1}
            style={{ transition: 'stroke-width 0.15s, opacity 0.15s', willChange: 'stroke-width' }}
            onMouseEnter={() => setHovQ(seg.q)}
            onMouseLeave={() => setHovQ(null)}
          />
        ))}
        {/* Centro */}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize={22}
          fontWeight={700} fill="var(--text)">{total}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize={9}
          fill="var(--muted)">tasks</text>
      </svg>

      {/* Legenda */}
      <div className="db-donut-legend">
        {segments.map(seg => {
          const pct = sum > 0 ? Math.round((seg.val / sum) * 100) : 0
          return (
            <div
              key={seg.q}
              className={`db-donut-item${hovQ === seg.q ? ' db-donut-item-hov' : ''}`}
              onMouseEnter={() => setHovQ(seg.q)}
              onMouseLeave={() => setHovQ(null)}
            >
              <span className="db-donut-dot" style={{ background: Q_COLORS[seg.q] }} />
              <span className="db-donut-qlabel">{Q_LABELS[seg.q]}</span>
              <span className="db-donut-pct">{pct}%</span>
              <span className="db-donut-count">({seg.val})</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bloco 4 — Lista de projetos ────────────────────────────────────────────────
function ProjectRow({ proj }: { proj: ProjectRoi }) {
  const pct = (proj.tasks_total ?? 0) > 0
    ? Math.round(((proj.tasks_done ?? 0) / proj.tasks_total) * 100)
    : 0
  const byQuadrant = proj.tasks_by_quadrant ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
  const totalQ = Object.values(byQuadrant).reduce((s, v) => s + (v ?? 0), 0) || 1

  return (
    <div className="db-proj-row">
      <div className="db-proj-header">
        <span className="db-proj-name">{proj.name}</span>
        <span className="db-proj-time">{fmtMin(proj.total_minutes)}</span>
        <span className="db-proj-tasks">
          {proj.tasks_done}/{proj.tasks_total} tasks
        </span>
        {proj.overdue_count > 0 && (
          <span className="db-proj-overdue">{proj.overdue_count} vencidas</span>
        )}
      </div>

      {/* Barra de progresso principal */}
      <div className="db-proj-bar-bg">
        <div className="db-proj-bar-fill" style={{ width: `${pct}%` }} />
        <span className="db-proj-bar-pct">{pct}%</span>
      </div>

      {/* Mini distribuição de quadrantes */}
      <div className="db-proj-quad-row">
        {(['q1', 'q2', 'q3', 'q4'] as const).map(q => {
          const v = byQuadrant[q] ?? 0
          const w = Math.round((v / totalQ) * 100)
          return w > 0 ? (
            <div
              key={q}
              className="db-proj-quad-seg"
              style={{ width: `${w}%`, background: Q_COLORS[q] }}
              title={`${Q_LABELS[q]}: ${v} tasks`}
            />
          ) : null
        })}
      </div>
    </div>
  )
}

// ── Bloco 5 — Heatmap ─────────────────────────────────────────────────────────
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function Heatmap({ data }: { data: HeatmapDay[] }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; d: HeatmapDay } | null>(null)

  // Organiza em grade: primeiro dia alinhado à coluna da semana correta
  const CELL = 12; const GAP = 2; const STEP = CELL + GAP
  const firstDay = data[0] ? dayOfWeek(data[0].date) : 0

  // Preenche células vazias no início
  const padded: (HeatmapDay | null)[] = [
    ...Array(firstDay).fill(null),
    ...data,
  ]
  const cols = Math.ceil(padded.length / 7)

  const svgW = cols * STEP + 36   // 36px para labels de dia da semana
  const svgH = 7 * STEP + 20      // 20px para labels de mês

  // Labels de mês
  const monthLabels: { col: number; label: string }[] = []
  data.forEach((d, i) => {
    const idx = i + firstDay
    const col = Math.floor(idx / 7)
    try {
      const dt = new Date(d.date + 'T12:00:00')
      if (dt.getDate() <= 7) {
        monthLabels.push({
          col,
          label: dt.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        })
      }
    } catch { /* skip */ }
  })

  return (
    <div className="db-heat-wrap" style={{ position: 'relative', overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ width: Math.max(svgW, 400), height: svgH }}
        className="db-heat-svg"
      >
        {/* Day labels */}
        {[1, 3, 5].map(d => (
          <text key={d} x={0} y={20 + d * STEP + CELL / 2 + 2}
            fontSize={8} fill="var(--muted)" dominantBaseline="middle">
            {DAY_LABELS[d]}
          </text>
        ))}

        {/* Month labels */}
        {monthLabels.map((m, i) => (
          <text key={i} x={36 + m.col * STEP} y={10}
            fontSize={8} fill="var(--muted)">{m.label}</text>
        ))}

        {/* Cells */}
        {padded.map((d, idx) => {
          const col = Math.floor(idx / 7)
          const row = idx % 7
          const x   = 36 + col * STEP
          const y   = 20 + row * STEP
          if (!d) return (
            <rect key={idx} x={x} y={y} width={CELL} height={CELL}
              rx={2} fill="transparent" />
          )
          return (
            <rect
              key={idx} x={x} y={y} width={CELL} height={CELL} rx={2}
              fill={heatColor(d.minutes)}
              className="db-heat-cell"
              onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, d })}
              onMouseLeave={() => setTooltip(null)}
            />
          )
        })}
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div className="db-tooltip db-tooltip-fixed"
          style={{ top: tooltip.y - 70, left: tooltip.x + 12 }}>
          <div className="db-tooltip-date">{fmtDate(tooltip.d.date)}</div>
          <div className="db-tooltip-val">{fmtMin(tooltip.d.minutes)}</div>
          {tooltip.d.tasks_completed > 0 && (
            <div className="db-tooltip-mood">✓ {tooltip.d.tasks_completed} tasks</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── DashboardPage ──────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { data: roi, isLoading: loadingRoi } = useRoiData()
  const { data: heat, isLoading: loadingHeat } = useHeatmap()

  if (loadingRoi) {
    return (
      <div className="db-wrapper">
        <div className="db-loading">
          <div className="skeleton skeleton-line" style={{ width: 180, height: 14 }} />
          <div className="db-kpi-row" style={{ marginTop: 20 }}>
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="db-kpi-card">
                <div className="skeleton skeleton-line" style={{ height: 40 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!roi) {
    return (
      <div className="db-wrapper">
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <div className="empty-title">Nenhum dado ainda</div>
          <div className="empty-sub">Registre sessões de foco e complete tasks para ver seu ROI</div>
        </div>
      </div>
    )
  }

  const summary              = roi.summary              ?? {}
  const projects             = roi.projects             ?? []
  const quadrant_distribution = roi.quadrant_distribution ?? { q1: 0, q2: 0, q3: 0, q4: 0 }
  const daily_focus          = roi.daily_focus          ?? []
  const totalTasks = Object.values(quadrant_distribution).reduce((s, v) => s + (v ?? 0), 0)

  return (
    <div className="db-wrapper">
      {/* Header */}
      <div className="db-header">
        <h2 className="db-title">Dashboard ROI</h2>
        <p className="db-subtitle">
          Produtividade real · {(summary as any).most_active_project
            ? `Projeto mais ativo: ${(summary as any).most_active_project}`
            : 'Nenhum projeto ativo ainda'}
        </p>
      </div>

      {/* Bloco 1 — KPIs */}
      <div className="db-kpi-row">
        <KpiCard
          icon="⏱"
          value={fmtMin((summary as any).total_focus_minutes_week ?? 0)}
          label="Foco esta semana"
          sub={`Total: ${fmtMin((summary as any).total_focus_minutes ?? 0)}`}
        />
        <KpiCard
          icon="✓"
          value={String((summary as any).tasks_completed_total ?? 0)}
          label="Tasks concluídas"
          sub={`Esta semana: ${(summary as any).tasks_completed_week ?? 0}`}
        />
        <KpiCard
          icon="🎯"
          value={`${(summary as any).focus_score ?? 0}%`}
          label="Score de foco"
          sub="Tempo em Q1+Q2"
          accent={((summary as any).focus_score ?? 0) >= 60}
        />
        <KpiCard
          icon="🔥"
          value={String((summary as any).current_streak_days ?? 0)}
          label="Dias consecutivos"
          sub={((summary as any).current_streak_days ?? 0) > 0 ? 'sequência ativa' : 'inicie hoje!'}
          accent={((summary as any).current_streak_days ?? 0) >= 3}
        />
      </div>

      {/* Bloco 2 + 3 — Bar chart + Donut */}
      <div className="db-charts-row">
        <div className="db-chart-card db-chart-bar">
          <div className="db-card-title">Foco diário — últimos 14 dias</div>
          <BarChart data={daily_focus} />
          <div className="db-bar-legend">
            {[['flow', '🔥 flow'], ['ok', '😐 ok'], ['blocked', '😤 bloqueado']].map(([mood, label]) => (
              <span key={mood} className="db-bar-legend-item">
                <span style={{ background: MOOD_COLOR[mood] }} className="db-bar-legend-dot" />
                {label}
              </span>
            ))}
          </div>
        </div>

        <div className="db-chart-card db-chart-donut">
          <div className="db-card-title">Distribuição por quadrante</div>
          <DonutChart dist={quadrant_distribution} total={totalTasks} />
        </div>
      </div>

      {/* Bloco 4 — Projetos */}
      {projects.length > 0 && (
        <div className="db-chart-card">
          <div className="db-card-title">Projetos</div>
          <div className="db-proj-list">
            {projects
              .filter(p => p.tasks_total > 0)
              .sort((a, b) => b.total_minutes - a.total_minutes)
              .map(p => <ProjectRow key={p.id} proj={p} />)
            }
          </div>
        </div>
      )}

      {/* Bloco 5 — Heatmap */}
      <div className="db-chart-card">
        <div className="db-card-title">Atividade — últimos 90 dias</div>
        {loadingHeat || !heat ? (
          <div className="skeleton skeleton-line" style={{ height: 120 }} />
        ) : (
          <>
            <Heatmap data={heat} />
            <div className="db-heat-legend">
              <span className="db-heat-legend-label">menos</span>
              {HEAT_COLORS.map((c, i) => (
                <span key={i} className="db-heat-legend-cell"
                  style={{ background: c, border: '1px solid var(--border)' }} />
              ))}
              <span className="db-heat-legend-label">mais</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
