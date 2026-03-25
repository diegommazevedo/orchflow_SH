import { useState, useRef, useCallback, useEffect } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import type { AppView } from './components/layout/Sidebar'
import { Topbar } from './components/layout/Topbar'
import { ChatPanel } from './components/layout/ChatPanel'
import { Board, BoardSkeleton } from './components/backlog/Board'
import { ImportPage } from './pages/ImportPage'
import { RoiDashboard } from './pages/RoiDashboard'
import { MatrixPage } from './pages/MatrixPage'
import { ListView } from './pages/ListView'
import { TimelinePage } from './pages/TimelinePage'
import { AgentsPage } from './pages/AgentsPage'
import { SprintPage } from './pages/SprintPage'
import { DashboardPage } from './pages/DashboardPage'
import { TrashPage } from './pages/TrashPage'
import { ErrorToastHost } from './components/ui/ErrorToast'
import { FocusWidget } from './components/focus/FocusWidget'
import { LoginPage } from './pages/LoginPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { useProjects, useTasks, useTrashTasks } from './hooks/useData'
import { useTheme } from './hooks/useTheme'
import { useSprints, getActiveSprint } from './hooks/useSprints'
import type { Project, Sprint, Task } from './types'
import { toArr } from './utils/array'

// ── AppInner: conteúdo principal (requer autenticação) ────────────────────────

function AppInner() {
  const { isAuthenticated, isLoading: authLoading, user, logout } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()

  // Redireciona para login quando token expira via evento
  useEffect(() => {
    const handler = () => {}   // isAuthenticated já volta a false via AuthContext
    window.addEventListener('orchflow:logout', handler)
    return () => window.removeEventListener('orchflow:logout', handler)
  }, [])

  // Skeleton fullscreen enquanto verifica sessão
  if (authLoading) {
    return (
      <div className="lp-overlay">
        <div className="lp-card">
          <div className="lp-logo">
            <div className="lp-logo-dot" />
            <span>OrchFlow</span>
          </div>
          <div className="skeleton" style={{ height: 16, marginTop: 24, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 16, marginTop: 12, borderRadius: 8, width: '60%' }} />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) return <LoginPage />

  return <AppShell user={user!} onLogout={logout} theme={theme} onThemeToggle={toggleTheme} />
}

// ── AppShell: layout principal ────────────────────────────────────────────────

function AppShell({ user, onLogout, theme, onThemeToggle }: {
  user: { name: string; email: string; nickname: string | null }
  onLogout: () => void
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}) {

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView]                       = useState<AppView>('board')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [chatVisible, setChatVisible]         = useState(true)
  const [activeSprint, setActiveSprint]       = useState<Sprint | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: projectsData, isLoading: loadingProjects } = useProjects()
  const { data: tasksData, isLoading: loadingTasks }     = useTasks(activeProjectId ?? undefined)
  const { data: trashItems }                             = useTrashTasks(activeProjectId)
  const { data: sprintsData }                              = useSprints(activeProjectId)

  const projects = toArr<Project>(projectsData)
  const tasks    = toArr<Task>(tasksData)
  const sprints  = toArr<Sprint>(sprintsData)

  const activeProject       = projects.find(p => p.id === activeProjectId)
  const isLoading           = loadingProjects || loadingTasks
  const activeTaskCount     = tasks.length
  const activeHasInProgress = tasks.some(t => t.status === 'in_progress')
  const trashCount          = trashItems?.length ?? 0
  // Sprint ativo derivado dos dados — fallback para o sprint selecionado pelo usuário
  const currentSprint       = activeSprint ?? getActiveSprint(sprints)

  const handleSelectProject = useCallback((id: string | null) => {
    if (id === activeProjectId) return
    if (transitionTimer.current) clearTimeout(transitionTimer.current)
    setIsTransitioning(true)
    setActiveSprint(null)       // reset sprint ao trocar de projeto
    transitionTimer.current = setTimeout(() => {
      setActiveProjectId(id)
      transitionTimer.current = setTimeout(() => setIsTransitioning(false), 150)
    }, 150)
  }, [activeProjectId])

  function handleProjectCreatedFromImport(projectId: string) {
    setActiveProjectId(projectId)
    setView('board')
  }

  function handleSelectSprint(sprint: Sprint) {
    setActiveSprint(sprint)
    setView('sprint')
  }

  function renderMain() {
    switch (view) {
      case 'import':
        return (
          <ImportPage
            onBack={() => setView('board')}
            onProjectCreated={handleProjectCreatedFromImport}
          />
        )
      case 'roi':
        return <RoiDashboard projects={projects} activeProjectId={activeProjectId} />

      case 'dashboard':
        return <DashboardPage />

      case 'matrix':
        return <MatrixPage activeProjectId={activeProjectId} />

      case 'list':
        return <ListView activeProjectId={activeProjectId} projectName={activeProject?.name} />

      case 'timeline':
        return <TimelinePage activeProjectId={activeProjectId} />

      case 'agents':
        return <AgentsPage />

      case 'trash':
        return (
          <TrashPage activeProjectId={activeProjectId} projectName={activeProject?.name} />
        )

      case 'sprint':
        return (
          <SprintPage
            projectId={activeProjectId}
            activeSprint={currentSprint}
            onSelectSprint={handleSelectSprint}
          />
        )

      default: // 'board'
        return (
          <>
            <div className="main-header">
              <div>
                <div className="main-title">
                  {loadingProjects
                    ? 'Carregando...'
                    : activeProject
                      ? activeProject.name
                      : 'Selecione um projeto'}
                </div>
                <div className="main-subtitle">
                  // {activeProjectId ? `${tasks.length} tarefas` : 'nenhum projeto ativo'}
                </div>
              </div>
              <div className="view-tabs">
                <div className="view-tab active"  onClick={() => setView('board')}>board</div>
                <div className="view-tab"         onClick={() => setView('list')}>lista</div>
                <div className="view-tab"         onClick={() => setView('matrix')}>matriz</div>
                <div className="view-tab"         onClick={() => setView('timeline')}>timeline</div>
                <div className="view-tab"         onClick={() => setView('sprint')}>sprint</div>
              </div>
            </div>

            {activeProjectId ? (
              loadingTasks ? (
                <BoardSkeleton />
              ) : (
                <Board
                  tasks={tasks}
                  projectId={activeProjectId}
                  projectName={activeProject?.name}
                />
              )
            ) : (
              <div className="empty-state">
                <div className="empty-icon">⬡</div>
                <div className="empty-title">Selecione um projeto</div>
                <div className="empty-sub">ou crie um novo na sidebar</div>
              </div>
            )}
          </>
        )
    }
  }

  return (
    <div className="app">
      <ErrorToastHost />
      <Topbar
        activeProjectName={activeProject?.name}
        activeView={view}
        theme={theme}
        onThemeToggle={onThemeToggle}
        isLoading={isLoading}
        user={user}
        onLogout={onLogout}
      />

      <div className="shell">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={handleSelectProject}
          activeView={view}
          onNavigate={setView}
          activeTaskCount={activeTaskCount}
          trashCount={trashCount}
          activeHasInProgress={activeHasInProgress}
          isLoading={loadingProjects}
          sprints={sprints}
          activeSprintId={currentSprint?.id ?? null}
          onSelectSprint={handleSelectSprint}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        />

        <div className={`main${isTransitioning ? ' main-transitioning' : ''}`}>
          {renderMain()}
        </div>

        {/* Chat panel wrapper — colapsável em < 1400px via FAB */}
        <div className={`chat-panel-wrap${chatVisible ? '' : ' chat-hidden'}`}>
          <ChatPanel
            projectId={activeProjectId}
            onProjectCreated={handleProjectCreatedFromImport}
          />
        </div>
      </div>

      {/* FAB para abrir/fechar chat em telas menores */}
      <button
        className="chat-fab"
        onClick={() => setChatVisible(v => !v)}
        title={chatVisible ? 'Fechar chat' : 'Abrir chat'}
        aria-label={chatVisible ? 'Fechar chat' : 'Abrir chat'}
      >
        ⬡
      </button>

      {/* Widget de hiperfoco — visível em todas as vistas exceto ImportPage */}
      {view !== 'import' && (
        <div className="fw-wrapper">
          <FocusWidget
            tasks={tasks}
            projectId={activeProjectId}
          />
        </div>
      )}
    </div>
  )
}

// ── Export raiz com AuthProvider ──────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
