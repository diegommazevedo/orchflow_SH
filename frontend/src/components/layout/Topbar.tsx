/**
 * Topbar — barra superior do OrchFlow.
 *
 * Sprint 6B: avatar mostra iniciais reais do usuário autenticado.
 * Clique no avatar abre dropdown com nome, email e botão de logout.
 *
 * Leis respeitadas:
 * - Zero chamadas ao banco
 * - CORS não afetado
 * - Senha nunca exibida
 */
import { useState, useRef, useEffect } from 'react'
import type { Theme } from '../../hooks/useTheme'
import type { AppView } from './Sidebar'

const VIEW_LABELS: Record<AppView, string> = {
  board:        'Board',
  sprint:       'Sprints',
  matrix:       'Matriz',
  list:         'Lista',
  timeline:     'Timeline',
  agents:       'Configurações',
  roi:          'ROI',
  import:       'Import',
  dashboard:    'Tempo & ROI',
  trash:        'Lixeira',
  ai_tokens:    'IA & Créditos',
  org_settings: 'Organização',
}

/** Gera iniciais a partir do nome (até 2 letras) */
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'VC'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

interface AuthUser {
  name:  string
  email: string
  avatar_url?: string
}

interface Props {
  activeProjectId?: string | null
  activeProjectName?: string
  workspaceName?: string
  activeView?: AppView
  theme: Theme
  onThemeToggle: () => void
  isLoading?: boolean
  user?: AuthUser | null
  onGoHome?: () => void
  onGoProject?: (projectId: string) => void
  onOpenSettings?: () => void
  onLogout?: () => void
}

export function Topbar({
  activeProjectId,
  activeProjectName,
  workspaceName,
  activeView,
  theme,
  onThemeToggle,
  isLoading,
  user,
  onGoHome,
  onGoProject,
  onOpenSettings,
  onLogout,
}: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isDark       = theme === 'dark'
  const themeIcon    = isDark ? '☀️' : '🌙'
  const themeTooltip = isDark ? 'Tema claro' : 'Tema escuro'
  const viewLabel    = activeView ? VIEW_LABELS[activeView] : undefined
  const initials     = user?.name ? getInitials(user.name) : 'VC'

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  return (
    <div className="topbar">
      <div className="logo">
        <div className="logo-dot" />
        OrchFlow
      </div>

      {/* Breadcrumb */}
      <nav className="topbar-breadcrumb" aria-label="Localização">
        <button type="button" className="crumb-btn topbar-breadcrumb-root" onClick={onGoHome}>OrchFlow</button>
        <span className="topbar-breadcrumb-sep">›</span>
        {workspaceName ? (
          <button type="button" className="crumb-btn topbar-breadcrumb-project" onClick={onGoHome}>{workspaceName}</button>
        ) : (
          <button type="button" className="crumb-btn topbar-breadcrumb-project" onClick={onGoHome}>Início</button>
        )}
        {activeProjectName ? (
          <>
            <span className="topbar-breadcrumb-sep">›</span>
            <button
              type="button"
              className="crumb-btn topbar-breadcrumb-project"
              onClick={() => activeProjectId && onGoProject?.(activeProjectId)}
            >
              {activeProjectName}
            </button>
            {viewLabel && (
              <>
                <span className="topbar-breadcrumb-sep">›</span>
                <span className="topbar-breadcrumb-view">{viewLabel}</span>
              </>
            )}
          </>
        ) : (
          <>
            <span className="topbar-breadcrumb-sep">›</span>
            <button type="button" className="crumb-btn topbar-breadcrumb-project" onClick={onGoHome}>Voltar</button>
          </>
        )}
      </nav>

      <div className="topbar-right">
        <button
          type="button"
          className="theme-toggle-btn"
          onClick={onThemeToggle}
          title={themeTooltip}
          aria-label={themeTooltip}
        >
          {themeIcon}
        </button>

        {/* Avatar com dropdown */}
        <div className="avatar-wrap" ref={dropdownRef}>
          <div
            className="avatar"
            title={user?.email ?? 'Usuário'}
            onClick={() => setDropdownOpen(v => !v)}
            role="button"
            tabIndex={0}
            aria-haspopup="true"
            aria-expanded={dropdownOpen}
            onKeyDown={e => { if (e.key === 'Enter') setDropdownOpen(v => !v) }}
          >
            {user?.avatar_url ? <img className="avatar-img" src={user.avatar_url} alt={user.name} /> : initials}
          </div>

          {dropdownOpen && (
            <div className="avatar-dropdown" role="menu">
              <div className="avatar-dropdown-user">
                <div className="avatar-dropdown-name">{user?.name ?? '—'}</div>
                <div className="avatar-dropdown-email">{user?.email ?? '—'}</div>
              </div>
              <div className="avatar-dropdown-sep" />
              <button
                className="avatar-dropdown-logout"
                role="menuitem"
                onClick={() => { setDropdownOpen(false); onOpenSettings?.() }}
              >
                Configurações
              </button>
              <button
                className="avatar-dropdown-logout"
                role="menuitem"
                onClick={() => { setDropdownOpen(false); onLogout?.() }}
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Barra de progresso indeterminada */}
      {isLoading && <div className="topbar-progress" />}
    </div>
  )
}
