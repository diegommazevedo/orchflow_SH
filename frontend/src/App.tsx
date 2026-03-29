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
import AITokensPage from './pages/AITokensPage'
import OnboardingPage from './pages/OnboardingPage'
import OrgSettingsPage from './pages/OrgSettingsPage'
import { VocabularyProvider } from './contexts/VocabularyContext'
import { ErrorToastHost } from './components/ui/ErrorToast'
import { TemplateSelector } from './components/templates/TemplateSelector'
import { FocusWidget } from './components/focus/FocusWidget'
import { LoginPage } from './pages/LoginPage'
import { WorkspaceNewPage } from './pages/WorkspaceNewPage'
import { RegisterPage } from './pages/RegisterPage'
import { OAuthCallbackPage } from './pages/OAuthCallbackPage'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { acceptInvite } from './services/api'
import { useProjects, useTasks, useTrashTasks } from './hooks/useData'
import { useTheme } from './hooks/useTheme'
import { useSprints, getActiveSprint } from './hooks/useSprints'
import type { Project, Sprint, Task } from './types'
import { toArr } from './utils/array'

// ── AppInner: conteúdo principal (requer autenticação) ────────────────────────

function AppInner() {
  const { isAuthenticated, isLoading: authLoading, currentUser, currentWorkspace, logout, checkAuth } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
  const [authView, setAuthView] = useState<'login' | 'register' | 'workspace-new' | 'app' | 'oauth-callback'>('login')

  // Redireciona para login quando token expira via evento
  useEffect(() => {
    const handler = () => {}   // isAuthenticated já volta a false via AuthContext
    window.addEventListener('orchflow:logout', handler)
    return () => window.removeEventListener('orchflow:logout', handler)
  }, [])

  useEffect(() => {
    const path = window.location.pathname
    if (path.startsWith('/invite/')) {
      const token = path.split('/invite/')[1] ?? ''
      const url = new URL(window.location.href)
      const workspaceId = url.searchParams.get('workspace')
      if (token && workspaceId && isAuthenticated) {
        void acceptInvite(workspaceId, token).finally(() => {
          window.history.replaceState({}, '', '/')
          window.dispatchEvent(new Event('popstate'))
        })
      }
    }
  }, [isAuthenticated])

  useEffect(() => {
    function resolveView() {
      const path = window.location.pathname
      if (path.startsWith('/auth/callback')) {
        setAuthView('oauth-callback')
        return
      }
      if (path.startsWith('/register')) {
        setAuthView('register')
        return
      }
      if (!isAuthenticated) {
        setAuthView('login')
        return
      }
      if (!currentWorkspace) {
        setAuthView('workspace-new')
        return
      }
      setAuthView('app')
    }
    resolveView()
    const onPop = () => resolveView()
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [isAuthenticated, currentWorkspace])

  // Skeleton fullscreen enquanto verifica sessão
  if (authLoading) {
    return (
      <>
        <Topbar
          theme={theme}
          onThemeToggle={toggleTheme}
          onGoHome={() => { window.history.replaceState({}, '', '/'); window.dispatchEvent(new Event('popstate')) }}
        />
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
      </>
    )
  }

  if (authView === 'oauth-callback') return (
    <>
      <Topbar theme={theme} onThemeToggle={toggleTheme} onGoHome={() => { window.history.replaceState({}, '', '/'); window.dispatchEvent(new Event('popstate')) }} />
      <OAuthCallbackPage />
    </>
  )
  if (authView === 'register') return (
    <>
      <Topbar theme={theme} onThemeToggle={toggleTheme} onGoHome={() => { window.history.replaceState({}, '', '/'); window.dispatchEvent(new Event('popstate')) }} />
      <RegisterPage />
    </>
  )
  if (authView === 'login') return (
    <>
      <Topbar theme={theme} onThemeToggle={toggleTheme} onGoHome={() => { window.history.replaceState({}, '', '/'); window.dispatchEvent(new Event('popstate')) }} />
      <LoginPage />
    </>
  )
  if (authView === 'workspace-new') return (
    <>
      <Topbar
        theme={theme}
        onThemeToggle={toggleTheme}
        user={currentUser ?? undefined}
        onGoHome={() => { window.history.replaceState({}, '', '/'); window.dispatchEvent(new Event('popstate')) }}
      />
      <WorkspaceNewPage />
    </>
  )
  return (
    <ProtectedRoute>
      <AppShell
        user={currentUser!}
        workspace={currentWorkspace!}
        onLogout={logout}
        onWorkspaceUpdated={checkAuth}
        theme={theme}
        onThemeToggle={toggleTheme}
      />
    </ProtectedRoute>
  )
}

// ── AppShell: layout principal ────────────────────────────────────────────────

function AppShell({ user, workspace, onLogout, onWorkspaceUpdated, theme, onThemeToggle }: {
  user: { name: string; email: string; nickname?: string | null }
  workspace: import('./types').Workspace
  onLogout: () => void
  onWorkspaceUpdated: () => void
  theme: 'dark' | 'light'
  onThemeToggle: () => void
}) {

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [view, setView]                       = useState<AppView>('dashboard')

  // Sprint 8: onboarding + primary_color
  const [showOnboarding, setShowOnboarding]   = useState(!workspace.onboarding_completed)

  // Aplica cor primária da organização via CSS variable
  useEffect(() => {
    const color = workspace.primary_color || '#89b4fa'
    document.documentElement.style.setProperty('--accent', color)
  }, [workspace.primary_color])
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [chatVisible, setChatVisible]         = useState(true)
  const [activeSprint, setActiveSprint]       = useState<Sprint | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [templatePickProjectId, setTemplatePickProjectId] = useState<string | null>(null)
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
        return (
          <AgentsPage
            activeProjectId={activeProjectId}
            firstProjectId={projects[0]?.id ?? null}
            onSelectProject={id => handleSelectProject(id)}
            onNavigate={setView}
          />
        )

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

      case 'ai_tokens':
        return <AITokensPage />

      case 'org_settings':
        return (
          <OrgSettingsPage
            workspace={workspace}
            onUpdated={(ws) => {
              onWorkspaceUpdated()
              // Apply updated primary color immediately
              const color = ws.primary_color || '#89b4fa'
              document.documentElement.style.setProperty('--accent', color)
            }}
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

  if (showOnboarding) return (
    <OnboardingPage
      workspace={workspace}
      onComplete={(ws) => {
        onWorkspaceUpdated()
        setShowOnboarding(false)
        const color = ws.primary_color || '#89b4fa'
        document.documentElement.style.setProperty('--accent', color)
      }}
      onSkip={() => setShowOnboarding(false)}
    />
  )

  return (
    <VocabularyProvider vocabulary={workspace.vocabulary ?? undefined}>
    <div className="app">
      <ErrorToastHost />
      <Topbar
        activeProjectId={activeProjectId}
        activeProjectName={activeProject?.name}
        activeView={view}
        theme={theme}
        onThemeToggle={onThemeToggle}
        isLoading={isLoading}
        user={user}
        workspaceName={workspace.name}
        onGoHome={() => {
          setView('board')
          setActiveProjectId(null)
        }}
        onGoProject={(projectId) => {
          setActiveProjectId(projectId)
          setView('board')
        }}
        onOpenSettings={() => setView('agents')}
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
          currentUser={user}
          currentWorkspace={workspace}
          onLogout={onLogout}
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

      {templatePickProjectId && (
        <TemplateSelector
          projectId={templatePickProjectId}
          onClose={() => setTemplatePickProjectId(null)}
          onApplied={() => setTemplatePickProjectId(null)}
        />
      )}
    </div>
    </VocabularyProvider>
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
