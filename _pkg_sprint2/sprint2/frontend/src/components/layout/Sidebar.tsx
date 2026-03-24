import { useState } from 'react'
import type { Project } from '../../types'
import { useCreateProject } from '../../hooks/useData'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string) => void
}

export function Sidebar({ projects, activeProjectId, onSelect }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const createProject = useCreateProject()

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createProject.mutate({ name: name.trim() }, {
      onSuccess: (p) => { onSelect(p.id); setAdding(false); setName('') }
    })
  }

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Workspace</div>
        <div className="nav-item active"><span className="nav-icon">⬛</span>Backlog</div>
        <div className="nav-item"><span className="nav-icon">◈</span>Matriz</div>
        <div className="nav-item"><span className="nav-icon">◷</span>Tempo & ROI</div>
        <div className="nav-item"><span className="nav-icon">⬡</span>Agentes</div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Projetos</div>

        {projects.map(p => (
          <div
            key={p.id}
            className={`project-item${activeProjectId === p.id ? ' project-active' : ''}`}
            onClick={() => onSelect(p.id)}
          >
            <div className="project-dot" style={{ background: '#7c6df0' }} />
            {p.name}
          </div>
        ))}

        {adding ? (
          <form onSubmit={handleCreate} style={{ padding: '6px 8px' }}>
            <input
              autoFocus
              className="add-input"
              placeholder="Nome do projeto..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <div className="add-form-btns" style={{ marginTop: 6 }}>
              <button type="submit" className="btn-confirm-sm">Criar</button>
              <button type="button" className="btn-cancel-sm" onClick={() => setAdding(false)}>×</button>
            </div>
          </form>
        ) : (
          <div className="project-item project-add" onClick={() => setAdding(true)}>
            + novo projeto
          </div>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="roi-widget">
          <div className="roi-label">// sessão atual</div>
          <div className="roi-row">
            <span className="roi-key">projetos</span>
            <span className="roi-val">{projects.length}</span>
          </div>
          <div className="roi-row">
            <span className="roi-key">ativo</span>
            <span className="roi-val" style={{ color: '#7c6df0', fontSize: 10, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {projects.find(p => p.id === activeProjectId)?.name ?? '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
