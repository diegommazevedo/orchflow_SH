/**
 * Sidebar — navegação lateral do OrchFlow.
 *
 * Sprint 5B: Seção SPRINTS adicionada abaixo de PROJETOS quando há projeto ativo.
 *   - Sprint ativo destacado com badge
 *   - Histórico de sprints concluídos
 *   - [+ novo sprint] → chama onNavigateSprint callback
 *
 * Leis respeitadas:
 * - Dados de sprint vêm de props (App.tsx chama useSprints) — zero fetch no Sidebar
 * - CORS mantido
 */
import { useState } from 'react'
import type { Project, Sprint } from '../../types'
import { useCreateProject } from '../../hooks/useData'
import { toArr } from '../../utils/array'

export type AppView =
  | 'board'
  | 'matrix'
  | 'list'
  | 'timeline'
  | 'agents'
  | 'roi'
  | 'import'
  | 'sprint'
  | 'dashboard'
  | 'trash'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string) => void
  activeView?: AppView
  onNavigate?: (view: AppView) => void
  /** Total de tasks do projeto ativo */
  activeTaskCount?: number
  /** Itens na lixeira do projeto ativo */
  trashCount?: number
  /** Se o projeto ativo tem tasks em andamento */
  activeHasInProgress?: boolean
  /** Projetos carregando */
  isLoading?: boolean
  /** Sprints do projeto ativo (passados do App.tsx) */
  sprints?: Sprint[]
  /** Sprint atualmente selecionado */
  activeSprintId?: string | null
  /** Callback ao clicar num sprint */
  onSelectSprint?: (sprint: Sprint) => void
  /** Estado de colapso controlado pelo pai */
  collapsed?: boolean
  /** Callback quando o botão de colapso é clicado */
  onToggleCollapse?: () => void
}

interface NavItem {
  view: AppView
  icon: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { view: 'board',      icon: '⬛', label: 'Backlog'        },
  { view: 'sprint',     icon: '◷',  label: 'Sprints'        },
  { view: 'matrix',     icon: '◈',  label: 'Matriz'         },
  { view: 'list',       icon: '≡',  label: 'Lista'          },
  { view: 'timeline',   icon: '📅', label: 'Timeline'       },
  { view: 'dashboard',  icon: '📊', label: 'Tempo & ROI'    },
  { view: 'agents',     icon: '⬡',  label: 'Agentes'        },
  { view: 'import',     icon: '📎', label: 'Import / Upload'},
]

const SPRINT_STATUS_LABELS: Record<Sprint['status'], string> = {
  planning:  'planejamento',
  active:    '● ativo',
  completed: '✓ concluído',
  cancelled: 'cancelado',
}

const SPRINT_STATUS_COLORS: Record<Sprint['status'], string> = {
  planning:  '#7c6df0',
  active:    '#5eead4',
  completed: '#48cae4',
  cancelled: '#666688',
}

export function Sidebar({
  projects: projectsProp,
  activeProjectId,
  onSelect,
  activeView = 'board',
  onNavigate,
  activeTaskCount,
  trashCount,
  activeHasInProgress,
  isLoading,
  sprints = [],
  activeSprintId,
  onSelectSprint,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const projects = toArr<Project>(projectsProp)
  const [addingProject, setAddingProject] = useState(false)
  const [projectName, setProjectName]     = useState('')
  const createProject = useCreateProject()

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!projectName.trim()) return
    createProject.mutate({ name: projectName.trim() }, {
      onSuccess: (p) => { onSelect(p.id); setAddingProject(false); setProjectName('') }
    })
  }

  const sprintList = toArr<Sprint>(sprints)
  const activeSprint = sprintList.find(s => s.status === 'active')
  const otherSprints = sprintList.filter(s => s.id !== activeSprint?.id).slice(0, 4)

  return (
    <div className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>

      {/* ── Botão colapsar / expandir ─────────────────────────── */}
      <button
        className="sidebar-toggle-btn"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expandir menu' : 'Ocultar menu'}
        aria-label={collapsed ? 'Expandir menu' : 'Ocultar menu'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      {/* ── Navegação global ─────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Workspace</div>

        {NAV_ITEMS.map(({ view, icon, label }) => (
          <div
            key={view}
            className={`nav-item${activeView === view ? ' active' : ''}`}
            onClick={() => onNavigate?.(view)}
            role="button"
            tabIndex={0}
            title={label}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') onNavigate?.(view)
            }}
          >
            <span className="nav-icon">{icon}</span>
            <span className="nav-label">{label}</span>
          </div>
        ))}

        <div
          className={`nav-item nav-item-trash${activeView === 'trash' ? ' active' : ''}`}
          onClick={() => onNavigate?.('trash')}
          role="button"
          tabIndex={0}
          title="Lixeira"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') onNavigate?.('trash')
          }}
        >
          <span className="nav-icon">🗑</span>
          <span className="nav-label">Lixeira</span>
          {typeof trashCount === 'number' && trashCount > 0 && (
            <span className="sidebar-trash-badge">{trashCount > 99 ? '99+' : trashCount}</span>
          )}
        </div>
      </div>

      {/* ── Projetos ─────────────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Projetos</div>

        {isLoading ? (
          [1, 2, 3].map(n => (
            <div key={n} className="skeleton sidebar-skeleton-item" />
          ))
        ) : (
          projects.map(p => {
            const isActive = activeProjectId === p.id
            return (
              <div
                key={p.id}
                className={`project-item${isActive ? ' project-active' : ''}`}
                onClick={() => onSelect(p.id)}
                title={p.name}
              >
                <div className="project-dot" style={{ background: '#7c6df0' }} />
                <span className="project-item-name">{p.name}</span>

                {isActive && typeof activeTaskCount === 'number' && (
                  <span className="project-task-count">{activeTaskCount}</span>
                )}
                {isActive && activeHasInProgress && (
                  <span className="project-inprogress-dot" title="Tasks em andamento" />
                )}
              </div>
            )
          })
        )}

        {addingProject ? (
          <form onSubmit={handleCreateProject} style={{ padding: '6px 8px' }}>
            <input
              autoFocus
              className="add-input"
              placeholder="Nome do projeto..."
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
            />
            <div className="add-form-btns" style={{ marginTop: 6 }}>
              <button type="submit" className="btn-confirm-sm">Criar</button>
              <button type="button" className="btn-cancel-sm" onClick={() => setAddingProject(false)}>×</button>
            </div>
          </form>
        ) : (
          <div className="project-item project-add" onClick={() => setAddingProject(true)}>
            + novo projeto
          </div>
        )}
      </div>

      {/* ── Sprints (somente quando há projeto ativo) ────────────── */}
      {activeProjectId && (
        <div className="sidebar-section">
          <div className="sidebar-label">Sprints</div>

          {/* Sprint ativo destacado */}
          {activeSprint ? (
            <div
              className={`sprint-item sprint-item-active${activeSprintId === activeSprint.id ? ' sprint-item-selected' : ''}`}
              onClick={() => {
                onSelectSprint?.(activeSprint)
                onNavigate?.('sprint')
              }}
              role="button"
              tabIndex={0}
              title={activeSprint.name}
            >
              <span className="sprint-item-name">{activeSprint.name}</span>
              <span className="sprint-item-status" style={{ color: SPRINT_STATUS_COLORS.active }}>
                {SPRINT_STATUS_LABELS.active}
              </span>
            </div>
          ) : (
            <div className="sprint-item-empty">sem sprint ativo</div>
          )}

          {/* Histórico compacto */}
          {otherSprints.map(s => (
            <div
              key={s.id}
              className={`sprint-item${activeSprintId === s.id ? ' sprint-item-selected' : ''}`}
              onClick={() => {
                onSelectSprint?.(s)
                onNavigate?.('sprint')
              }}
              role="button"
              tabIndex={0}
              title={s.name}
            >
              <span className="sprint-item-name">{s.name}</span>
              <span className="sprint-item-status" style={{ color: SPRINT_STATUS_COLORS[s.status] }}>
                {SPRINT_STATUS_LABELS[s.status]}
              </span>
            </div>
          ))}

          <div
            className="project-item project-add"
            onClick={() => onNavigate?.('sprint')}
          >
            + novo sprint
          </div>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div className="sidebar-footer">
        <div className="roi-widget">
          <div className="roi-label">// sessão atual</div>
          <div className="roi-row">
            <span className="roi-key">projetos</span>
            <span className="roi-val">{projects.length}</span>
          </div>
          {activeSprint && (
            <div className="roi-row">
              <span className="roi-key">sprint</span>
              <span className="roi-val" style={{ color: '#5eead4', fontSize: 10 }}>
                {activeSprint.name}
              </span>
            </div>
          )}
          <div className="roi-row">
            <span className="roi-key">ativo</span>
            <span
              className="roi-val"
              style={{
                color: '#7c6df0', fontSize: 10, maxWidth: 100,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {projects.find(p => p.id === activeProjectId)?.name ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
