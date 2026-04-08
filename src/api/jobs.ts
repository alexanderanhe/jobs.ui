import type { JobsPage } from '../types/jobs'

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'

type QueryValue = string | number | boolean | undefined | null

const buildQuery = (params: Record<string, QueryValue>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

const httpGet = async <T>(
  path: string,
  params: Record<string, QueryValue>,
  signal?: AbortSignal
): Promise<T> => {
  const url = `${BASE_URL}${path}${buildQuery(params)}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = (await res.json()) as { ok: boolean; data: T }
  if (!json.ok) throw new Error('API error')
  return json.data
}

export const fetchNearby = (
  params: {
    lat: number
    lng: number
    radiusKm?: number
    page?: number
    limit?: number
    keyword?: string
    remoteType?: string
    city?: string
    country?: string
  },
  signal?: AbortSignal
) => {
  const { lat, lng, radiusKm, page, limit, keyword, remoteType, city, country } =
    params
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('lat/lng requeridos')
  }
  return httpGet<JobsPage>(
    '/api/jobs/nearby',
    { lat, lng, radiusKm, page, limit, keyword, remoteType, city, country },
    signal
  )
}

export const fetchInBounds = (
  params: {
    north: number
    south: number
    east: number
    west: number
    page?: number
    limit?: number
    keyword?: string
    remoteType?: string
    city?: string
    country?: string
  },
  signal?: AbortSignal
) => {
  const { north, south, east, west, page, limit, keyword, remoteType, city, country } =
    params
  if (
    !Number.isFinite(north) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(west)
  ) {
    throw new Error('bounds inválidos')
  }
  return httpGet<JobsPage>(
    '/api/jobs/in-bounds',
    { north, south, east, west, page, limit, keyword, remoteType, city, country },
    signal
  )
}

export const fetchJobsList = (
  params: {
    keyword?: string
    city?: string
    country?: string
    tags?: string | string[]
    page?: number
    limit?: number
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  },
  signal?: AbortSignal
) => {
  const { keyword, city, country, tags, page, limit, sortBy, sortOrder } = params
  const tagsParam = Array.isArray(tags) ? tags.join(',') : tags
  return httpGet<JobsPage>(
    '/api/jobs',
    { keyword, city, country, tags: tagsParam, page, limit, sortBy, sortOrder },
    signal
  )
}

export const fetchJobById = (id: string, signal?: AbortSignal) => {
  if (!id) throw new Error('id requerido')
  return httpGet<JobsPage['items'][number]>(`/api/jobs/${id}`, {}, signal)
}

export const jobToLatLng = (coords?: [number, number]) => {
  if (!coords) return null
  const [lng, lat] = coords
  // GeoJSON viene como [lng, lat]; el mapa suele esperar [lat, lng]
  return [lat, lng] as const
}
