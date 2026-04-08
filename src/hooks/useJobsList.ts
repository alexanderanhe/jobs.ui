import { useRef, useState } from 'react'
import { fetchJobsList } from '../api/jobs'
import type { JobsPage } from '../types/jobs'

type State = {
  loading: boolean
  error: string | null
  data: JobsPage | null
}

type Params = {
  keyword?: string
  city?: string
  country?: string
  tags?: string | string[]
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export const useJobsList = () => {
  const [state, setState] = useState<State>({ loading: false, error: null, data: null })
  const abortRef = useRef<AbortController | null>(null)

  const search = async (params: Params) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setState((s) => ({ ...s, loading: true, error: null }))

    try {
      const data = await fetchJobsList(params, controller.signal)
      setState({ loading: false, error: null, data })
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setState({ loading: false, error: err?.message || 'Error', data: null })
    }
  }

  return { ...state, search }
}
