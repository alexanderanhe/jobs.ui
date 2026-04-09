import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { FiBriefcase, FiMapPin, FiSearch, FiTag, FiX, FiZap } from 'react-icons/fi'
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
const formatCompactNumber = (value: number) => {
  const compact = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
  return compact.replace(/\s/g, '').toUpperCase()
}

const formatSalaryLabel = (job: Job) => {
  const currency = job.currency || 'MXN'
  const currencyLabel = currency === 'MXN' ? 'MN' : currency
  const value =
    typeof job.salaryMin === 'number'
      ? job.salaryMin
      : typeof job.salaryMax === 'number'
      ? job.salaryMax
      : null
  if (!value) return ''
  return `${currencyLabel} ${formatCompactNumber(value)}`
}

const formatSalaryFull = (job: Job) => {
  const currency = job.currency || 'MXN'
  const min = typeof job.salaryMin === 'number' ? job.salaryMin : null
  const max = typeof job.salaryMax === 'number' ? job.salaryMax : null
  if (min && max) {
    return `${currency} ${min.toLocaleString('es-MX')} - ${max.toLocaleString('es-MX')}`
  }
  if (min || max) {
    const value = min ?? max ?? 0
    return `${currency} ${value.toLocaleString('es-MX')}`
  }
  return '—'
}

const buildSalaryMarkerSvg = (label: string) => {
  const hasLabel = Boolean(label)
  const textLength = label.length
  const width = Math.max(54, textLength * 7 + 26)
  const labelHeight = hasLabel ? 26 : 0
  const gap = hasLabel ? 8 : 0
  const dotRadius = 8
  const height = labelHeight + gap + dotRadius * 2
  const bg = '#f97316'
  const dotFill = '#f97316'

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    hasLabel
      ? `<rect x="0" y="0" width="${width}" height="${labelHeight}" rx="8" fill="${bg}"/>`
      : '',
    hasLabel
      ? `<text x="${width / 2}" y="17" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#ffffff">${label}</text>`
      : '',
    `<circle cx="${width / 2}" cy="${labelHeight + gap + dotRadius}" r="${dotRadius}" fill="${dotFill}" stroke="#ffffff" stroke-width="2"/>`,
    '</svg>',
  ].join('')

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    width,
    height,
    anchor: { x: width / 2, y: labelHeight + gap + dotRadius },
  }
}

const googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined
let googleMapsPromise: Promise<void> | null = null

const loadGoogleMaps = (key: string) => {
  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google)
  }

  const waitForMaps = () =>
    new Promise<typeof window.google>((resolve, reject) => {
      const startedAt = Date.now()
      const timer = window.setInterval(() => {
        if (window.google?.maps?.Map) {
          window.clearInterval(timer)
          resolve(window.google)
          return
        }
        if (Date.now() - startedAt > 8000) {
          window.clearInterval(timer)
          reject(new Error('Google Maps no está disponible.'))
        }
      }, 100)
    })

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      const desiredSrc = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=marker&v=weekly&loading=async`
      const existing = document.querySelector(
        'script[data-google-maps="true"]'
      ) as HTMLScriptElement | null
      if (existing) {
        if (existing.src === desiredSrc) {
          existing.addEventListener('load', () => {
            waitForMaps().then(resolve).catch(reject)
          })
          existing.addEventListener('error', () =>
            reject(new Error('No se pudo cargar Google Maps.'))
          )
          return
        }
        existing.remove()
      }

      const script = document.createElement('script')
      script.dataset.googleMaps = 'true'
      script.src = desiredSrc
      script.async = true
      script.defer = true
      script.onload = () => {
        waitForMaps().then(resolve).catch(reject)
      }
      script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'))
      document.head.appendChild(script)
    })
  }

  return googleMapsPromise
}

function MapView({
  onBoundsChanged,
  jobs,
  selectedJobId,
  onSelectJob,
}: {
  onBoundsChanged: (bounds: BoundsLiteral) => void
  jobs?: Job[]
  selectedJobId: string | null
  onSelectJob: (jobId: string) => void
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
          if (!window.google?.maps?.Map) {
            throw new Error('Google Maps no está disponible.')
          }
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
        markersRef.current.forEach((marker) => {
          if (marker.map !== undefined) {
            marker.map = null
          } else if (marker.setMap) {
            marker.setMap(null)
          }
        })
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
          const label = formatSalaryLabel(job)
          const svgIcon = buildSalaryMarkerSvg(label)

          const marker = new window.google.maps.Marker({
            position,
            map,
            title: job.title,
            icon: {
              url: svgIcon.url,
              scaledSize: new window.google.maps.Size(svgIcon.width, svgIcon.height),
              anchor: new window.google.maps.Point(svgIcon.anchor.x, svgIcon.anchor.y),
            },
          })
          marker.addListener('click', () => onSelectJob(job.id))
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
  }, [jobs, mapReady, selectedJobId, onSelectJob])

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
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

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
    setSelectedJobId(null)
  }

  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null
    return jobsList.data?.items.find((job) => job.id === selectedJobId) ?? null
  }, [jobsList.data, selectedJobId])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 text-slate-900">
      <MapView
        onBoundsChanged={onMapMove}
        jobs={jobsList.data?.items}
        selectedJobId={selectedJobId}
        onSelectJob={setSelectedJobId}
      />

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
            {jobsList.data?.items.map((job) => {
              const isSelected = job.id === selectedJobId
              return (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedJobId(job.id)}
                  className={`w-full px-4 py-3 text-left transition ${
                    isSelected ? 'bg-slate-900/5' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-900">{job.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {job.company || '—'} · {formatCity(job)} · {job.remoteType || '—'}
                  </div>
                </button>
              )
            })}
            </div>
          </div>
        </section>
      )}

      {selectedJob && (
        <section className="absolute left-6 bottom-6 z-20 w-[min(380px,94vw)] rounded-2xl border border-slate-900/10 bg-white/95 p-4 shadow-2xl backdrop-blur max-[900px]:left-4 max-[900px]:right-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">{selectedJob.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {selectedJob.company || '—'} · {formatCity(selectedJob)} ·{' '}
                {selectedJob.remoteType || '—'}
              </div>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              onClick={() => setSelectedJobId(null)}
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                Salario
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatSalaryFull(selectedJob)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                Ubicación
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {selectedJob.addressText || selectedJob.city || '—'}
              </div>
            </div>
            {selectedJob.tags?.length ? (
              <div className="col-span-2">
                <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  Tags
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {selectedJob.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {selectedJob.description ? (
              <div className="col-span-2 text-[11px] text-slate-500">
                {selectedJob.description}
              </div>
            ) : null}
            {selectedJob.applyUrl ? (
              <a
                className="col-span-2 inline-flex items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white shadow-md"
                href={selectedJob.applyUrl}
                target="_blank"
                rel="noreferrer"
              >
                Ver oferta
              </a>
            ) : null}
          </div>
        </section>
      )}
    </div>
  )
}

export default App
