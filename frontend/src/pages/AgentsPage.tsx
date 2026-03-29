import { useEffect } from 'react'
import type { AppView } from '../components/layout/Sidebar'

interface Props {
  activeProjectId: string | null
  firstProjectId: string | null
  onSelectProject: (projectId: string) => void
  onNavigate: (view: AppView) => void
}

/**
 * Cleanup CP-020:
 * /agents vira redirect imediato para configurações no board (KanbanSettings).
 */
export function AgentsPage({ activeProjectId, firstProjectId, onSelectProject, onNavigate }: Props) {
  useEffect(() => {
    const targetProjectId = activeProjectId ?? firstProjectId
    if (targetProjectId) {
      onSelectProject(targetProjectId)
      onNavigate('board')
      window.dispatchEvent(
        new CustomEvent('orchflow:api-error', {
          detail: { message: 'Abra "Colunas" no board para acessar as configurações do projeto.' },
        }),
      )
      return
    }

    onNavigate('board')
    window.dispatchEvent(
      new CustomEvent('orchflow:api-error', {
        detail: { message: 'Selecione um projeto para acessar as configurações.' },
      }),
    )
  }, [activeProjectId, firstProjectId, onNavigate, onSelectProject])

  return null
}
