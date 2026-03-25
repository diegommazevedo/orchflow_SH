import { useState, useCallback } from 'react'
import { isAxiosError } from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { uploadSheetFile, confirmSheetImport } from '../services/sheetApi'
import type { SheetParseResult, SheetMapping } from '../types'

function detailMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const d = err.response?.data
    if (d && typeof d === 'object' && 'detail' in d) {
      const det = (d as { detail: unknown }).detail
      if (typeof det === 'string') return det
      if (Array.isArray(det)) return det.map(String).join(', ')
    }
    return err.message || 'Erro de rede'
  }
  return 'Falha ao processar a planilha.'
}

const SHEET_EXTS = ['xlsx', 'xls', 'csv']

export function isSheetFile(file: File): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return SHEET_EXTS.includes(ext)
}

export function useSheetImport() {
  const qc = useQueryClient()
  const [wizardData, setWizardData] = useState<SheetParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!SHEET_EXTS.includes(ext)) {
      setError('Envie apenas arquivos .xlsx ou .csv')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await uploadSheetFile(file)
      setWizardData(data)
    } catch (e) {
      setError(detailMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const confirm = useCallback(
    async (projectId: string, mapping: SheetMapping, defaults?: Record<string, string>) => {
      if (!wizardData) throw new Error('Nenhuma planilha carregada')
      setLoading(true)
      setError(null)
      try {
        const res = await confirmSheetImport({
          file_id: wizardData.file_id,
          project_id: projectId,
          mapping,
          user_id: 'default',
          defaults,
        })
        await qc.invalidateQueries({ queryKey: ['tasks'] })
        await qc.invalidateQueries({ queryKey: ['projects'] })
        setWizardData(null)
        return res
      } catch (e) {
        setError(detailMessage(e))
        throw e
      } finally {
        setLoading(false)
      }
    },
    [qc, wizardData]
  )

  const cancel = useCallback(() => {
    setWizardData(null)
    setError(null)
  }, [])

  return { wizardData, loading, error, processFile, confirm, cancel }
}
