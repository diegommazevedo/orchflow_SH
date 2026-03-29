/**
 * VocabularyContext — Sprint 8: Vocabulário customizado da organização
 *
 * Expõe t(key) para que qualquer componente use os termos da organização
 * no lugar dos termos padrão do sistema.
 *
 * Uso:
 *   const { t } = useVocabulary()
 *   t('task')    → "Tarefa" ou o que a org definiu
 *   t('sprint')  → "Sprint" ou "Ciclo" etc.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { OrgVocabulary } from '../types'

// ── Termos padrão ─────────────────────────────────────────────────────────────

const DEFAULTS: OrgVocabulary = {
  term_project: 'Projeto',
  term_task:    'Tarefa',
  term_sprint:  'Sprint',
  term_backlog: 'Backlog',
  term_member:  'Membro',
  term_client:  'Cliente',
}

// ── Mapeamento de key → campo ─────────────────────────────────────────────────

type VocabKey = 'project' | 'task' | 'sprint' | 'backlog' | 'member' | 'client'

const KEY_MAP: Record<VocabKey, keyof OrgVocabulary> = {
  project: 'term_project',
  task:    'term_task',
  sprint:  'term_sprint',
  backlog: 'term_backlog',
  member:  'term_member',
  client:  'term_client',
}

// ── Context ───────────────────────────────────────────────────────────────────

interface VocabularyContextValue {
  /** Retorna o termo customizado para a key fornecida */
  t: (key: VocabKey) => string
  /** Vocabulário completo atual */
  vocabulary: OrgVocabulary
}

const VocabularyContext = createContext<VocabularyContextValue>({
  t: (key) => DEFAULTS[KEY_MAP[key]],
  vocabulary: DEFAULTS,
})

// ── Provider ──────────────────────────────────────────────────────────────────

interface Props {
  children: ReactNode
  vocabulary?: OrgVocabulary | null
}

export function VocabularyProvider({ children, vocabulary }: Props) {
  const merged = useMemo<OrgVocabulary>(() => {
    if (!vocabulary) return DEFAULTS
    return {
      term_project: vocabulary.term_project || DEFAULTS.term_project,
      term_task:    vocabulary.term_task    || DEFAULTS.term_task,
      term_sprint:  vocabulary.term_sprint  || DEFAULTS.term_sprint,
      term_backlog: vocabulary.term_backlog || DEFAULTS.term_backlog,
      term_member:  vocabulary.term_member  || DEFAULTS.term_member,
      term_client:  vocabulary.term_client  || DEFAULTS.term_client,
    }
  }, [vocabulary])

  const value = useMemo<VocabularyContextValue>(() => ({
    t: (key: VocabKey) => merged[KEY_MAP[key]],
    vocabulary: merged,
  }), [merged])

  return (
    <VocabularyContext.Provider value={value}>
      {children}
    </VocabularyContext.Provider>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVocabulary(): VocabularyContextValue {
  return useContext(VocabularyContext)
}
