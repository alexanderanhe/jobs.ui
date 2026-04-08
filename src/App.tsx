import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { FiBriefcase, FiMapPin, FiSearch, FiTag, FiZap } from 'react-icons/fi'
import { useInBoundsJobs } from './hooks/useInBoundsJobs'
import { useJobsList } from './hooks/useJobsList'
import type { Job } from './types/jobs'

type BoundsLiteral = { north: number; south: number; east: number; west: number }

type Filters = {
  keyword: string
  city: string
  remoteType: string
  tags: string
}

declare global {
  interface Window {
    google?: any
  }
}

const formatCity = (job: Job) => job.city || job.addressText || '—'

const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
let googleMapsPromise: Promise<void> | null = null

const loadGoogleMaps = (key: string) => {
  if (window.google?.maps) {
    return Promise.resolve()
  }

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-google-maps="true"]')
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps.')))
        return
      }

      const script = document.createElement('script')
      script.dataset.googleMaps = 'true'
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'))
      document.head.appendChild(script)
    })
  }

  return googleMapsPromise
}

function MapView({
  onBoundsChanged,
  jobs,
}: {
  onBoundsChanged: (bounds: BoundsLiteral) => void
  jobs?: Job[]
}) {
  const mapRef = useRef<HTMLDivElement | null>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!mapRef.current) {
      return
    }

    if (!googleMapsKey) {
      setMapError('Falta VITE_GOOGLE_MAPS_KEY en el entorno.')
      return
    }

    let cancelled = false
    let idleListener: { remove: () => void } | null = null

    loadGoogleMaps(googleMapsKey)
      .then(() => {
        if (cancelled || !mapRef.current) {
          return
        }

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
            center: { lat: 19.4326, lng: -99.1332 },
            zoom: 11,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
          })
        }
        setMapReady(true)

        const map = mapInstanceRef.current
        idleListener = map.addListener('idle', () => {
          const bounds = map.getBounds?.()
          if (!bounds) {
            return
          }
          const ne = bounds.getNorthEast()
          const sw = bounds.getSouthWest()
          if (!ne || !sw) {
            return
          }
          onBoundsChanged({
            north: ne.lat(),
            south: sw.lat(),
            east: ne.lng(),
            west: sw.lng(),
          })
        })
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : 'No se pudo cargar el mapa.')
        }
      })

    return () => {
      cancelled = true
      if (idleListener) {
        idleListener.remove()
      }
    }
  }, [onBoundsChanged])

  useEffect(() => {
    if (!mapReady) {
      return
    }

    if (!googleMapsKey) {
      return
    }

    let cancelled = false

    loadGoogleMaps(googleMapsKey)
      .then(() => {
        if (cancelled || !mapInstanceRef.current) {
          return
        }

        const map = mapInstanceRef.current
        markersRef.current.forEach((marker) => marker.setMap(null))
        markersRef.current = []

        if (!jobs || jobs.length === 0) {
          return
        }

        const bounds = new window.google.maps.LatLngBounds()
        let lastPosition: { lat: number; lng: number } | null = null

        jobs.forEach((job) => {
          const coords = job.location?.coordinates
          if (!coords || coords.length < 2) return
          const [lng, lat] = coords
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

          const position = { lat, lng }
          lastPosition = position
          const marker = new window.google.maps.Marker({
            position,
            map,
            title: job.title,
          })
          markersRef.current.push(marker)
          bounds.extend(position)
        })

        if (markersRef.current.length === 1 && lastPosition) {
          map.setCenter(lastPosition)
          map.setZoom(12)
        } else if (markersRef.current.length > 1) {
          map.fitBounds(bounds, 120)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : 'No se pudo cargar el mapa.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [jobs, mapReady])

  return (
    <>
      <div ref={mapRef} className="absolute inset-0 h-full w-full" />
      {mapError && (
        <div className="absolute bottom-6 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-900/95 px-4 py-2 text-xs font-medium text-slate-50 shadow-xl">
          {mapError}
        </div>
      )}
    </>
  )
}

function App() {
  const [filters, setFilters] = useState<Filters>({
    keyword: '',
    city: '',
    remoteType: '',
    tags: '',
  })

  const jobsList = useJobsList()
  const [bounds, setBounds] = useState<BoundsLiteral | null>(null)

  useInBoundsJobs({
    bounds,
    keyword: filters.keyword,
    remoteType: filters.remoteType,
    city: filters.city,
    debounceMs: 400,
  })

  const onMapMove = useCallback((nextBounds: BoundsLiteral) => {
    setBounds(nextBounds)
  }, [])

  const tagsValue = useMemo(() => {
    const raw = filters.tags.trim()
    return raw ? raw.split(',').map((t) => t.trim()).filter(Boolean) : undefined
  }, [filters.tags])

  const handleSearch = () => {
    jobsList.search({
      keyword: filters.keyword,
      city: filters.city,
      tags: tagsValue,
      page: 1,
      limit: 20,
    })
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-900">
      <MapView onBoundsChanged={onMapMove} jobs={jobsList.data?.items} />

      {import.meta.env.DEV && (
        <div className="absolute bottom-6 left-6 z-30 rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-md backdrop-blur">
          maps-ui-v2
        </div>
      )}

      <aside className="absolute left-1/2 top-6 z-20 w-[min(1100px,calc(100%-3rem))] -translate-x-1/2 rounded-2xl border border-slate-900/10 bg-white/90 px-4 py-3 shadow-2xl backdrop-blur max-[900px]:w-[calc(100%-2rem)]">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_0.8fr_1.2fr_auto] lg:items-end">
          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span className="sr-only">Keyword</span>
            <div className="relative">
              <FiBriefcase className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-900/15 bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                value={filters.keyword}
                onChange={(e) => setFilters((s) => ({ ...s, keyword: e.target.value }))}
                placeholder="Keyword"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span className="sr-only">Ciudad</span>
            <div className="relative">
              <FiMapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-900/15 bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                value={filters.city}
                onChange={(e) => setFilters((s) => ({ ...s, city: e.target.value }))}
                placeholder="Ciudad"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span className="sr-only">Remote</span>
            <div className="relative">
              <FiZap className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                className="h-9 w-full appearance-none rounded-md border border-slate-900/15 bg-white pl-8 pr-7 text-xs text-slate-900 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                value={filters.remoteType}
                onChange={(e) => setFilters((s) => ({ ...s, remoteType: e.target.value }))}
              >
                <option value="">Cualquiera</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
          </label>

          <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            <span className="sr-only">Tags</span>
            <div className="relative">
              <FiTag className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-900/15 bg-white pl-8 pr-2.5 text-xs text-slate-900 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
                value={filters.tags}
                onChange={(e) => setFilters((s) => ({ ...s, tags: e.target.value }))}
                placeholder="Tags"
              />
            </div>
          </label>

          <button
            type="button"
            aria-label="Buscar"
            className="flex h-9 w-11 items-center justify-center rounded-lg bg-slate-900 text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            onClick={handleSearch}
          >
            <FiSearch className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {(jobsList.loading || jobsList.error || (jobsList.data && jobsList.data.items.length > 0)) && (
        <section className="absolute right-6 top-28 z-20 flex max-h-[calc(100svh-112px)] w-[min(420px,94vw)] flex-col rounded-2xl border border-slate-900/10 bg-white/90 p-4 shadow-2xl backdrop-blur max-[900px]:left-4 max-[900px]:right-4 max-[900px]:top-auto max-[900px]:bottom-4 max-[900px]:max-h-[45svh] max-[900px]:w-auto">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/70 bg-white">
            {jobsList.loading && <div className="px-4 py-3 text-sm text-slate-500">Cargando…</div>}
            {jobsList.error && (
              <div className="px-4 py-3 text-sm text-red-600">{jobsList.error}</div>
            )}
            <div className="min-h-0 flex-1 divide-y divide-slate-200/70 overflow-y-auto">
              {jobsList.data?.items.map((job) => (
                <div key={job.id} className="px-4 py-3">
                  <div className="text-sm font-semibold text-slate-900">{job.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {job.company || '—'} · {formatCity(job)} · {job.remoteType || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
