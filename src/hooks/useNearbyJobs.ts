import { useEffect, useRef, useState } from 'react'
import { fetchNearby } from '../api/jobs'
import type { JobsPage } from '../types/jobs'

type State = {
  loading: boolean
  error: string | null
  data: JobsPage | null
  permissionDenied: boolean
}

type Params = {
  radiusKm?: number
  page?: number
  limit?: number
  keyword?: string
  remoteType?: string
  city?: string
  country?: string
}

export const useNearbyJobs = (params: Params) => {
  const [state, setState] = useState<State>({
    loading: false,
    error: null,
    data: null,
    permissionDenied: false,
  })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'Geolocation no disponible',
      }))
      return
    }

    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null, permissionDenied: false }))

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (cancelled) return
        const { latitude: lat, longitude: lng } = pos.coords

        abortRef.current?.abort()
        const controller = new AbortController()
        abortRef.current = controller

        try {
          const data = await fetchNearby({ lat, lng, ...params }, controller.signal)
          if (!cancelled) {
            setState({ loading: false, error: null, data, permissionDenied: false })
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return
          if (!cancelled) {
            setState({
              loading: false,
              error: err?.message || 'Error',
              data: null,
              permissionDenied: false,
            })
          }
        }
      },
      (err) => {
        if (cancelled) return
        const denied = err.code === err.PERMISSION_DENIED
        setState({
          loading: false,
          error: denied ? 'Permiso de ubicación denegado' : err.message,
          data: null,
          permissionDenied: denied,
        })
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 10000 }
    )

    return () => {
      cancelled = true
      abortRef.current?.abort()
    }
  }, [
    params.radiusKm,
    params.page,
    params.limit,
    params.keyword,
    params.remoteType,
    params.city,
    params.country,
  ])

  return state
}
