import { useState, useRef, useEffect, useCallback } from 'react'
import type { Project } from '../../types'
import { useUpdateProject, useCloneProject, useDeleteProject } from '../../hooks/useData'

interface Props {
  projects: Project[]
  activeProjectId: string | null
  onSelect: (id: string) => void
  onNewProject: () => void
}

export function ProjectSelector({ projects, activeProjectId, onSelect, onNewProject }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [editModal, setEditModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  const blockRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const updateProject = useUpdateProject()
  const cloneProjectMut = useCloneProject()
  const deleteProjectMut = useDeleteProject()

  const active = projects.find(p => p.id === activeProjectId)

  // Close dropdown/menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const t = e.target as Node
      if (dropdownOpen && dropdownRef.current && !dropdownRef.current.contains(t) && !blockRef.current?.contains(t)) {
        setDropdownOpen(false)
        setSearch('')
      }
      if (menuOpen && menuRef.current && !menuRef.current.contains(t)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen, menuOpen])

  // Close on ESC
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setDropdownOpen(false)
        setMenuOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  // Focus search on dropdown open
  useEffect(() => {
    if (dropdownOpen && projects.length > 5) {
      setTimeout(() => searchRef.current?.focus(), 50)
    }
  }, [dropdownOpen, projects.length])

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects

  const toast = useCallback((msg: string) => {
    window.dispatchEvent(new CustomEvent('orchflow:api-error', { detail: { message: msg } }))
  }, [])

  function handleClone() {
    if (!active) return
    setMenuOpen(false)
    cloneProjectMut.mutate(active.id, {
      onSuccess: (p) => {
        onSelect(p.id)
        toast(`Projeto '${p.name}' criado`)
      },
    })
  }

  function openEdit() {
    if (!active) return
    setMenuOpen(false)
    setEditName(active.name)
    setEditDesc(active.description ?? '')
    setEditModal(true)
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!active || !editName.trim()) return
    updateProject.mutate(
      { id: active.id, name: editName.trim(), description: editDesc || undefined },
      { onSuccess: () => setEditModal(false) },
    )
  }

  function openDelete() {
    if (!active) return
    setMenuOpen(false)
    setDeleteModal(true)
  }

  function handleDelete() {
    if (!active) return
    const others = projects.filter(p => p.id !== active.id)
    deleteProjectMut.mutate(active.id, {
      onSuccess: () => {
        setDeleteModal(false)
        if (others.length > 0) {
          onSelect(others[0].id)
        } else {
          onSelect('')
        }
      },
    })
  }

  /** Called from Sidebar "ver todos" link */
  const focusSearch = useCallback(() => {
    setDropdownOpen(true)
    setTimeout(() => searchRef.current?.focus(), 50)
  }, [])

  // Expose focusSearch via ref-like approach (using DOM data attribute)
  useEffect(() => {
    const el = blockRef.current
    if (el) (el as any).__focusSearch = focusSearch
  }, [focusSearch])

  return (
    <div className="ps-wrapper" ref={blockRef}>
      {/* Main block */}
      <div
        className="ps-block"
        onClick={() => { setDropdownOpen(o => !o); setMenuOpen(false) }}
      >
        <div className="ps-block-left">
          {active ? (
            <>
              <span className="ps-dot" />
              <div className="ps-info">
                <span className="ps-name">{active.name}</span>
                {active.description && (
                  <span className="ps-description">{active.description}</span>
                )}
              </div>
            </>
          ) : (
            <span className="ps-name ps-name-empty">Selecionar projeto ▾</span>
          )}
        </div>
        <div className="ps-block-right">
          {active && <span className="ps-chevron">▾</span>}
          {active && (
            <button
              className="ps-actions-btn"
              title="Ações do projeto"
              onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); setDropdownOpen(false) }}
            >
              ⋯
            </button>
          )}
        </div>
      </div>

      {/* Dropdown: project list */}
      {dropdownOpen && (
        <div className="ps-dropdown" ref={dropdownRef}>
          {projects.length > 5 && (
            <input
              ref={searchRef}
              className="ps-search"
              placeholder="Buscar projeto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          )}
          <div className="ps-dropdown-list">
            {filtered.map(p => (
              <div
                key={p.id}
                className={`ps-item${p.id === activeProjectId ? ' ps-item-active' : ''}`}
                onClick={() => { onSelect(p.id); setDropdownOpen(false); setSearch('') }}
              >
                {p.id === activeProjectId && <span className="ps-item-dot">●</span>}
                <span>{p.name}</span>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="ps-item ps-item-empty">Nenhum projeto encontrado</div>
            )}
          </div>
          <div
            className="ps-item ps-item-new"
            onClick={() => { setDropdownOpen(false); onNewProject() }}
          >
            + Novo projeto
          </div>
        </div>
      )}

      {/* Menu: actions */}
      {menuOpen && (
        <div className="ps-menu" ref={menuRef}>
          <div className="ps-menu-item" onClick={openEdit}>✏ Editar projeto</div>
          <div className="ps-menu-item" onClick={handleClone}>⧉ Clonar projeto</div>
          <div className="ps-menu-sep" />
          <div className="ps-menu-item ps-menu-danger" onClick={openDelete}>🗑 Excluir projeto</div>
        </div>
      )}

      {/* Modal: edit */}
      {editModal && (
        <div className="ps-overlay" onClick={() => setEditModal(false)}>
          <form className="ps-modal" onClick={e => e.stopPropagation()} onSubmit={handleEdit}>
            <div className="ps-modal-title">Editar projeto</div>
            <label className="ps-modal-label">
              Nome
              <input
                className="ps-modal-input"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label className="ps-modal-label">
              Descrição
              <input
                className="ps-modal-input"
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Opcional"
              />
            </label>
            <div className="ps-modal-actions">
              <button type="button" className="ps-modal-btn ps-modal-btn-cancel" onClick={() => setEditModal(false)}>
                Cancelar
              </button>
              <button type="submit" className="ps-modal-btn ps-modal-btn-confirm">Salvar</button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: delete confirmation */}
      {deleteModal && active && (
        <div className="ps-overlay" onClick={() => setDeleteModal(false)}>
          <div className="ps-modal" onClick={e => e.stopPropagation()}>
            <div className="ps-modal-title">Excluir projeto</div>
            <p className="ps-modal-text">
              Excluir <strong>{active.name}</strong>? Tasks e dados serão arquivados.
            </p>
            <div className="ps-modal-actions">
              <button className="ps-modal-btn ps-modal-btn-cancel" onClick={() => setDeleteModal(false)}>
                Cancelar
              </button>
              <button className="ps-modal-btn ps-modal-btn-danger" onClick={handleDelete}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
