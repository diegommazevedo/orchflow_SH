import type { ReactNode } from 'react'
import { LoginPage } from '../../pages/LoginPage'
import { WorkspaceNewPage } from '../../pages/WorkspaceNewPage'
import { useAuth } from '../../contexts/AuthContext'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, currentWorkspace, isLoading } = useAuth()
  if (isLoading) return null
  if (!isAuthenticated) return <LoginPage />
  if (!currentWorkspace) return <WorkspaceNewPage />
  return <>{children}</>
}
