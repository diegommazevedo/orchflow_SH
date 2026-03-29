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
import { useState, useRef } from 'react'
import type { Project, Sprint } from '../../types'
import { useCreateProject } from '../../hooks/useData'
import { useAIWallet } from '../../hooks/useAITokens'
import { toArr } from '../../utils/array'
import { ProjectSelector } from './ProjectSelector'

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
  | 'ai_tokens'
  | 'org_settings'

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
  /** V2: após criar projeto — onboarding de template */
  onProjectCreated?: (projectId: string) => void
  currentUser?: { name: string; email: string; avatar_url?: string } | null
  currentWorkspace?: { name: string } | null
  onLogout?: () => void
}

interface NavItem {
  view: AppView
  icon: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { view: 'dashboard',    icon: '📊', label: 'Tempo & ROI'     },
  { view: 'board',        icon: '⬛', label: 'Backlog'         },
  { view: 'sprint',       icon: '◷',  label: 'Sprints'         },
  { view: 'matrix',       icon: '◈',  label: 'Matriz'          },
  { view: 'list',         icon: '≡',  label: 'Lista'           },
  { view: 'timeline',     icon: '📅', label: 'Timeline'        },
  { view: 'agents',       icon: '⬡',  label: 'Configurações'   },
  { view: 'import',       icon: '📎', label: 'Import / Upload' },
  { view: 'ai_tokens',    icon: '⚡', label: 'IA & Créditos'   },
  { view: 'org_settings', icon: '🏢', label: 'Organização'     },
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
  onProjectCreated,
  currentUser,
  currentWorkspace,
  onLogout,
}: Props) {
  const projects = toArr<Project>(projectsProp)
  const [addingProject, setAddingProject] = useState(false)
  const [projectName, setProjectName]     = useState('')
  const createProject = useCreateProject()

  // AI wallet alert badge
  const { wallet } = useAIWallet()
  const isAILow = wallet != null
    && wallet.alert_threshold_usd != null
    && wallet.balance_usd <= wallet.alert_threshold_usd

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!projectName.trim()) return
    createProject.mutate({ name: projectName.trim() }, {
      onSuccess: (p) => {
        onSelect(p.id)
        setAddingProject(false)
        setProjectName('')
        onProjectCreated?.(p.id)
      },
    })
  }

  const sprintList = toArr<Sprint>(sprints)
  const activeSprint = sprintList.find(s => s.status === 'active')
  const otherSprints = sprintList.filter(s => s.id !== activeSprint?.id).slice(0, 4)

  const psRef = useRef<HTMLDivElement>(null)
  const MAX_VISIBLE_PROJECTS = 5
  const visibleProjects = projects.slice(0, MAX_VISIBLE_PROJECTS)

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

      {/* ── Seletor de projeto (topo fixo) ─────────────────────── */}
      {!collapsed && (
        <div className="sidebar-ps-wrapper" ref={psRef}>
          <ProjectSelector
            projects={projects}
            activeProjectId={activeProjectId}
            onSelect={onSelect}
            onNewProject={() => setAddingProject(true)}
          />
        </div>
      )}

      {/* ── Navegação global ─────────────────────────────────────── */}
      <div className="sidebar-section">
        <div className="sidebar-label">Workspace</div>

        {NAV_ITEMS.map(({ view, icon, label }) => {
          const isAIItem = view === 'ai_tokens'
          return (
            <div
              key={view}
              className={[
                'nav-item',
                activeView === view ? 'active' : '',
                isAIItem && isAILow ? 'nav-item-ai-low' : '',
              ].filter(Boolean).join(' ')}
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
              {isAIItem && isAILow && (
                <span className="ai-low-badge">baixo</span>
              )}
            </div>
          )
        })}

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
          <>
            {visibleProjects.map(p => {
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
            })}
            {projects.length > MAX_VISIBLE_PROJECTS && (
              <div
                className="project-item project-add"
                onClick={() => {
                  const el = psRef.current?.querySelector('.ps-wrapper') as any
                  el?.__focusSearch?.()
                }}
              >
                ver todos ({projects.length})
              </div>
            )}
          </>
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
        {currentUser && (
          <div className="roi-widget" style={{ marginBottom: 8 }}>
            <div className="roi-label">// usuário</div>
            <div className="roi-row">
              <span className="roi-key">{currentUser.name}</span>
              <span className="roi-val" style={{ fontSize: 10 }}>{currentWorkspace?.name ?? 'sem workspace'}</span>
            </div>
            {onLogout && (
              <button type="button" className="btn-cancel-sm" onClick={onLogout}>Logout</button>
            )}
          </div>
        )}
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
