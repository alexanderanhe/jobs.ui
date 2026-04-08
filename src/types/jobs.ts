export type RemoteType = 'onsite' | 'hybrid' | 'remote' | string

export type Job = {
  id: string
  source?: string
  sourceId?: string
  title: string
  company?: string
  description?: string
  applyUrl?: string
  salaryMin?: number
  salaryMax?: number
  currency?: string
  addressText?: string
  city?: string
  country?: string
  remoteType?: RemoteType
  location?: {
    type: 'Point'
    coordinates: [number, number] // [lng, lat]
  }
  geocodedAt?: string
  postedAt?: string
  tags?: string[]
  createdAt?: string
  updatedAt?: string
  distanceMeters?: number
  distanceKm?: number
}

export type JobsPage = {
  page: number
  limit: number
  total: number
  items: Job[]
}

export type ApiEnvelope<T> = { ok: boolean; data: T }

export type JobsResponse = ApiEnvelope<JobsPage>
export type NearbyResponse = ApiEnvelope<JobsPage>
export type InBoundsResponse = ApiEnvelope<JobsPage>
