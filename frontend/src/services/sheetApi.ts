import api from './api'
import type { SheetParseResult, SheetMapping } from '../types'

export const uploadSheetFile = async (file: File): Promise<SheetParseResult> => {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await api.post<SheetParseResult>('/upload/sheet', fd, {
    headers: { 'Content-Type': undefined },
  })
  return data
}

export const confirmSheetImport = async (payload: {
  file_id: string
  project_id: string
  mapping: SheetMapping
  user_id?: string
  defaults?: Record<string, string>
}): Promise<{ tasks_created: number; tasks_skipped: number; message: string }> => {
  const { data } = await api.post('/upload/sheet/confirm', {
    file_id: payload.file_id,
    project_id: payload.project_id,
    mapping: payload.mapping,
    user_id: payload.user_id ?? 'default',
    defaults: payload.defaults ?? {},
  })
  return data
}
