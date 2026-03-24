import { useState } from 'react'
import { Sidebar } from './components/layout/Sidebar'
import { ChatPanel } from './components/layout/ChatPanel'
import { Board } from './components/backlog/Board'
import { useProjects, useTasks } from './hooks/useData'

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  const { data: projects = [], isLoading: loadingProjects } = useProjects()
  const { data: tasks = [], isLoading: loadingTasks } = useTasks(activeProjectId ?? undefined)

  const activeProject = projects.find(p => p.id === activeProjectId)

  return (
    <div className="app">
      {/* TOP BAR */}
      <div className="topbar">
        <div className="logo">
          <div className="logo-dot" />
          OrchFlow
        </div>
        {activeProject && (
          <div className="topbar-project">
            projeto ativo: <span>{activeProject.name}</span>
          </div>
        )}
        <div className="topbar-right">
          <div className="avatar">VC</div>
        </div>
      </div>

      {/* SHELL */}
      <div className="shell">
        <Sidebar
          projects={projects}
          activeProjectId={activeProjectId}
          onSelect={setActiveProjectId}
        />

        <div className="main">
          <div className="main-header">
            <div>
              <div className="main-title">
                {loadingProjects ? 'Carregando...' : activeProject ? activeProject.name : 'Selecione um projeto'}
              </div>
              <div className="main-subtitle">
                // {activeProjectId ? `${tasks.length} tarefas` : 'nenhum projeto ativo'}
              </div>
            </div>
            <div className="view-tabs">
              <div className="view-tab active">board</div>
              <div className="view-tab">lista</div>
              <div className="view-tab">matriz</div>
              <div className="view-tab">timeline</div>
            </div>
          </div>

          {activeProjectId ? (
            loadingTasks ? (
              <div className="loading-state">Carregando tarefas...</div>
            ) : (
              <Board tasks={tasks} projectId={activeProjectId} />
            )
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <div className="empty-title">Nenhum projeto selecionado</div>
              <div className="empty-sub">Crie um projeto na sidebar ou selecione um existente</div>
            </div>
          )}
        </div>

        <ChatPanel projectId={activeProjectId} />
      </div>
    </div>
  )
}
