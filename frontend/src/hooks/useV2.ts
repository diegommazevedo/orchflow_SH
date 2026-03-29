import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getKanbanColumns,
  reorderKanbanColumns,
  patchKanbanColumn,
  createKanbanColumn,
  deleteKanbanColumn,
  getCustomFields,
  createCustomField,
  deleteCustomField,
  getCustomFieldValues,
  upsertCustomFieldValue,
  getFieldDefinitions,
  createFieldDefinition,
  deleteFieldDefinition,
  getFieldValues,
  upsertFieldValue,
  listVerticalTemplates,
  applyVerticalTemplate,
  applyProjectTemplate,
  getTemplateById,
  analyzeSchema,
  applySchema,
  getSchemaVerticalSuggestion,
} from '../services/api'
import type { SchemaApplyResult, SchemaSuggestion } from '../types'

export function useKanbanColumns(projectId: string | undefined) {
  return useQuery({
    queryKey: ['kanban', projectId],
    queryFn: () => getKanbanColumns(projectId!),
    enabled: !!projectId,
  })
}

export function useReorderKanban() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { items: { id: string; order: number }[] }) => reorderKanbanColumns(vars.items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban'] }),
  })
}

export function usePatchKanbanColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; patch: Parameters<typeof patchKanbanColumn>[1] }) =>
      patchKanbanColumn(vars.id, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban'] }),
  })
}

export function useCreateKanbanColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (
      vars: {
        projectId: string
        name: string
        slug: string
        color?: string
        order?: number
        is_default?: boolean
        is_done?: boolean
      },
    ) => {
      const { projectId, ...body } = vars
      return createKanbanColumn(projectId, body)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban'] }),
  })
}

export function useDeleteKanbanColumn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteKanbanColumn(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kanban'] }),
  })
}

export function useCustomFields(projectId: string | undefined) {
  return useQuery({
    queryKey: ['custom-fields', projectId],
    queryFn: () => getCustomFields(projectId!),
    enabled: !!projectId,
  })
}

export function useCustomFieldValues(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['custom-field-values', entityType, entityId],
    queryFn: () => getCustomFieldValues(entityType, entityId!),
    enabled: !!entityId,
  })
}

export function useUpsertCustomFieldValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: upsertCustomFieldValue,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-field-values'] }),
  })
}

export function useCreateCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCustomField,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

export function useDeleteCustomField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteCustomField,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['custom-fields'] }),
  })
}

/** Frente 2 — definições via /api/projects/{id}/fields */
export function useFieldDefinitions(projectId: string | undefined) {
  return useQuery({
    queryKey: ['field-definitions', projectId],
    queryFn: () => getFieldDefinitions(projectId!),
    enabled: !!projectId,
  })
}

export function useCreateFieldDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string } & Parameters<typeof createFieldDefinition>[1]) => {
      const { projectId, ...body } = vars
      return createFieldDefinition(projectId, body)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-definitions'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
    },
  })
}

export function useDeleteFieldDefinition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; fieldId: string }) =>
      deleteFieldDefinition(vars.projectId, vars.fieldId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-definitions'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      qc.invalidateQueries({ queryKey: ['task-field-values'] })
    },
  })
}

export function useTaskFieldValues(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-field-values', taskId],
    queryFn: () => getFieldValues(taskId!),
    enabled: !!taskId,
  })
}

export function useUpsertTaskFieldValue() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { taskId: string; field_id: string; raw_value: unknown }) =>
      upsertFieldValue(vars.taskId, { field_id: vars.field_id, raw_value: vars.raw_value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-field-values'] }),
  })
}

export function useVerticalTemplates() {
  return useQuery({ queryKey: ['vertical-templates'], queryFn: listVerticalTemplates })
}

/** Frente 3 — aplicar por template_id (canónico). */
export function useApplyTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; templateId: string }) =>
      applyProjectTemplate(vars.projectId, vars.templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      qc.invalidateQueries({ queryKey: ['field-definitions'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['activity'] })
    },
  })
}

export const useTemplates = useVerticalTemplates

/** Alias explícito Frente 3 (mesmo que useApplyTemplate). */
export const useApplyProjectTemplate = useApplyTemplate

export function useTemplateDetail(templateId: string | null) {
  return useQuery({
    queryKey: ['vertical-template-detail', templateId],
    queryFn: () => getTemplateById(templateId!),
    enabled: !!templateId,
  })
}

export function useSchemaAnalyze() {
  return useMutation({ mutationFn: (projectId: string) => analyzeSchema(projectId) })
}

export function useSchemaApply() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars: { projectId: string; acceptedIds: string[]; allSuggestions: SchemaSuggestion[] }) =>
      applySchema(vars.projectId, { accepted_ids: vars.acceptedIds, all_suggestions: vars.allSuggestions }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kanban'] })
      qc.invalidateQueries({ queryKey: ['custom-fields'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

export function useSchemaAgent(projectId: string | undefined) {
  const analyzeMut = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error('projectId ausente')
      return analyzeSchema(projectId)
    },
  })
  const applyMut = useMutation({
    mutationFn: async (vars: { acceptedIds: string[]; allSuggestions: SchemaSuggestion[] }) => {
      if (!projectId) throw new Error('projectId ausente')
      return applySchema(projectId, { accepted_ids: vars.acceptedIds, all_suggestions: vars.allSuggestions })
    },
  })
  return {
    analyze: analyzeMut.mutateAsync,
    suggestions: analyzeMut.data?.suggestions ?? [],
    loading: analyzeMut.isPending,
    apply: applyMut.mutateAsync,
    applying: applyMut.isPending,
    result: applyMut.data as SchemaApplyResult | undefined,
  }
}

export function useSchemaVertical(projectId: string | undefined) {
  return useQuery({
    queryKey: ['schema-vertical', projectId],
    queryFn: () => getSchemaVerticalSuggestion(projectId!),
    enabled: !!projectId,
  })
}
