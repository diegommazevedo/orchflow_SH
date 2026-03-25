import { useState, useCallback } from 'react'
import { isAxiosError } from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { uploadContractPdf, confirmContractImport } from '../services/api'
import type { ContractParseResult } from '../types'

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
  return 'Falha ao processar o PDF.'
}

export function useContractPdfImport() {
  const qc = useQueryClient()
  const [wizardData, setWizardData] = useState<ContractParseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Envie apenas um arquivo .pdf')
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = await uploadContractPdf(file)
      setWizardData(data)
    } catch (e) {
      setError(detailMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const confirm = useCallback(
    async (data: ContractParseResult) => {
      setLoading(true)
      setError(null)
      try {
        const res = await confirmContractImport({ ...data, user_id: 'default' })
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
    [qc]
  )

  const cancel = useCallback(() => {
    setWizardData(null)
    setError(null)
  }, [])

  return { wizardData, loading, error, processFile, confirm, cancel }
}
