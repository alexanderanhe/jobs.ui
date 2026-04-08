import { useEffect, useRef, useState } from 'react'
import { fetchInBounds } from '../api/jobs'
import type { JobsPage } from '../types/jobs'

type BoundsLiteral = { north: number; south: number; east: number; west: number }
type BoundsLike =
  | BoundsLiteral
  | {
      getNorth: () => number
      getSouth: () => number
      getEast: () => number
      getWest: () => number
    }

type Params = {
  bounds?: BoundsLike | null
  page?: number
  limit?: number
  keyword?: string
  remoteType?: string
  city?: string
  country?: string
  debounceMs?: number
}

type State = {
  loading: boolean
  error: string | null
  data: JobsPage | null
}

const normalizeBounds = (bounds: BoundsLike): BoundsLiteral => {
  // Parsing de bounds: soporta {north,south,east,west} o métodos getNorth/getSouth/getEast/getWest
  if ('getNorth' in bounds) {
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    }
  }
  return bounds
}

export const useInBoundsJobs = (params: Params) => {
  const [state, setState] = useState<State>({ loading: false, error: null, data: null })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!params.bounds) return

    const { north, south, east, west } = normalizeBounds(params.bounds)
    if (north <= south || east <= west) return

    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const data = await fetchInBounds(
          {
            north,
            south,
            east,
            west,
            page: params.page,
            limit: params.limit,
            keyword: params.keyword,
            remoteType: params.remoteType,
            city: params.city,
            country: params.country,
          },
          controller.signal
        )
        setState({ loading: false, error: null, data })
      } catch (err: any) {
        if (err?.name === 'AbortError') return
        setState({ loading: false, error: err?.message || 'Error', data: null })
      }
    }, params.debounceMs ?? 400)

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [
    params.bounds,
    params.page,
    params.limit,
    params.keyword,
    params.remoteType,
    params.city,
    params.country,
    params.debounceMs,
  ])

  return state
}
