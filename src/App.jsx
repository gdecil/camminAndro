import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createGpxContent, createGpxFileName } from './gpx'

const API = '/api'

function formatDistance(distance) {
  const value = Number.parseFloat(distance)
  return Number.isFinite(value) ? `${value.toFixed(value % 1 ? 1 : 0)} km` : null
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function MapView({ items = [], detail = null, onSelect, className = '' }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layersRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current) return undefined

    const map = L.map(containerRef.current, { zoomControl: false, scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapRef.current = map
    layersRef.current = L.layerGroup().addTo(map)

    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layerGroup = layersRef.current
    if (!map || !layerGroup) return

    layerGroup.clearLayers()
    const bounds = []

    if (detail?.coordinates?.length) {
      const coordinates = detail.coordinates
        .filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
        .map((point) => [Number(point[0]), Number(point[1])])
      if (coordinates.length) {
        const line = L.polyline(coordinates, { color: '#315b43', weight: 5, opacity: 0.9, lineCap: 'round', lineJoin: 'round' })
        layerGroup.addLayer(line)
        const start = coordinates[0]
        const end = coordinates[coordinates.length - 1]
        L.circleMarker(start, { radius: 7, color: '#fff', weight: 3, fillColor: '#628b55', fillOpacity: 1 }).addTo(layerGroup)
        L.circleMarker(end, { radius: 7, color: '#fff', weight: 3, fillColor: '#d17854', fillOpacity: 1 }).addTo(layerGroup)
        bounds.push(...coordinates)
        map.fitBounds(line.getBounds(), { padding: [28, 28], maxZoom: 15 })
      }
    } else {
      items.forEach((item) => {
        if (!Number.isFinite(Number(item.latitude)) || !Number.isFinite(Number(item.longitude))) return
        const point = [Number(item.latitude), Number(item.longitude)]
        const marker = L.circleMarker(point, {
          radius: 7,
          color: '#f5f5ef',
          weight: 2,
          fillColor: item.type === 'route' ? '#315b43' : '#cf8059',
          fillOpacity: 0.95,
        })
        marker.bindTooltip(item.name, { direction: 'top', offset: [0, -8] })
        if (onSelect) marker.on('click', () => onSelect(item))
        layerGroup.addLayer(marker)
        bounds.push(point)
      })

      if (bounds.length > 1) map.fitBounds(bounds, { padding: [28, 28] })
      else if (bounds.length === 1) map.setView(bounds[0], 10)
      else map.setView([45.8, 10.3], 6)
    }

    window.setTimeout(() => map.invalidateSize(), 50)
  }, [items, detail, onSelect])

  return <div ref={containerRef} className={`leaflet-map ${className}`} aria-label="Mappa dei percorsi" />
}

function ElevationChart({ values = [] }) {
  const points = useMemo(() => {
    const elevations = values.map(Number).filter(Number.isFinite)
    if (elevations.length < 2) return null

    const sampleCount = Math.min(elevations.length, 100)
    const sampled = Array.from({ length: sampleCount }, (_, index) => {
      const sourceIndex = Math.round(index * (elevations.length - 1) / (sampleCount - 1))
      return elevations[sourceIndex]
    })
    const min = Math.min(...sampled)
    const max = Math.max(...sampled)
    const range = max - min || 1
    const line = sampled.map((value, index) => {
      const x = 4 + index * 292 / (sampled.length - 1)
      const y = 52 - (value - min) * 44 / range
      return `${index ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`
    }).join(' ')
    return { line, area: `${line} L 296 58 L 4 58 Z`, min: Math.round(min), max: Math.round(max) }
  }, [values])

  if (!points) return null
  return (
    <section className="elevation-card">
      <div className="section-heading">
        <div><span className="eyebrow">PROFILO</span><h2>Altimetria</h2></div>
        <span className="elevation-range">{points.min}–{points.max} m</span>
      </div>
      <svg className="elevation-chart" viewBox="0 0 300 62" role="img" aria-label={`Profilo altimetrico da ${points.min} a ${points.max} metri`}>
        <path d={points.area} className="elevation-area" />
        <path d={points.line} className="elevation-line" />
      </svg>
    </section>
  )
}

function RouteCard({ item, onOpen }) {
  const distance = formatDistance(item.distance)
  const date = formatDate(item.createdAt)
  return (
    <button className="route-card" onClick={() => onOpen(item)} type="button">
      <span className={`route-art ${item.type}`} aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none">
          <path d="M8 45C18 44 14 29 27 33s10 13 19 6 6-16 13-21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 5" />
          <circle cx="8" cy="45" r="4" fill="currentColor" />
          <circle cx="59" cy="18" r="4" fill="currentColor" />
        </svg>
      </span>
      <span className="route-card-content">
        <span className="route-card-top">
          <span className="route-type">PERCORSO</span>
          {date && <span className="route-date">{date}</span>}
        </span>
        <strong className="route-name">{item.name}</strong>
        <span className="route-card-meta">
          {distance && <span>{distance}</span>}
          {item.ascent && <span>↑ {item.ascent} m</span>}
          {!distance && !item.ascent && <span>Apri il percorso</span>}
          <span className="card-arrow" aria-hidden="true">↗</span>
        </span>
      </span>
    </button>
  )
}

function BottomNav({ page, onChange }) {
  return (
    <nav className="bottom-nav" aria-label="Navigazione principale">
      <button className={page === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => onChange('home')} type="button">
        <span className="nav-icon" aria-hidden="true">⌂</span><span>Esplora</span>
      </button>
      <button className={page === 'map' ? 'nav-item active' : 'nav-item'} onClick={() => onChange('map')} type="button">
        <span className="nav-icon" aria-hidden="true">⌖</span><span>Mappa</span>
      </button>
    </nav>
  )
}

function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState('home')
  const [selected, setSelected] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [notice, setNotice] = useState('')

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API}/saved`)
      if (!response.ok) throw new Error(`Il server ha risposto con errore ${response.status}.`)
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Il server ha restituito un elenco non valido.')
      setItems(data)
    } catch (loadError) {
      setError(loadError.message || 'Impossibile caricare i percorsi.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadItems() }, [loadItems])

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('it')
    return items.filter((item) => !normalizedQuery || item.name.toLocaleLowerCase('it').includes(normalizedQuery))
  }, [items, query])

  const openItem = useCallback(async (item) => {
    setDetailLoading(true)
    setDetailError('')
    setSelected(null)
    setPage('detail')
    try {
      const response = await fetch(`${API}/saved/${encodeURIComponent(item.id)}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `Il server ha risposto con errore ${response.status}.`)
      setSelected(result)
    } catch (loadError) {
      setDetailError(loadError.message || 'Impossibile aprire questo percorso.')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const createGpxFile = () => {
    if (!selected?.coordinates?.length) return
    const gpx = createGpxContent(selected)
    const fileName = createGpxFileName(selected.name)
    return new File([gpx], fileName, { type: 'application/gpx+xml' })
  }

  const downloadGpxFile = (file) => {
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = file.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const showNotice = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 4000)
  }

  const openWithOruxMaps = async () => {
    const file = createGpxFile()
    if (!file) return

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: selected.name,
          text: 'Apri questa traccia GPX con OruxMaps.',
        })
        showNotice('Scegli OruxMaps nel menu di condivisione.')
      } catch (shareError) {
        if (shareError.name === 'AbortError') return
        console.error('Condivisione GPX non riuscita:', shareError)
        downloadGpxFile(file)
        showNotice('Condivisione non riuscita: GPX scaricato. Aprilo con OruxMaps.')
      }
      return
    }

    downloadGpxFile(file)
    showNotice('GPX scaricato. Aprilo dal telefono con OruxMaps.')
  }

  const downloadGpx = () => {
    const file = createGpxFile()
    if (!file) return
    downloadGpxFile(file)
    showNotice('Traccia GPX scaricata')
  }

  const backToList = () => {
    setPage('home')
    setSelected(null)
    setDetailError('')
  }

  const pageItems = useMemo(() => (
    query.trim() ? filteredItems : items
  ), [filteredItems, items, query])

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={backToList} aria-label="Vai alla home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>CAMMINI<span className="brand-dot">.</span></span>
        </button>
        <span className="topbar-caption">IL TUO ATLANTE PERSONALE</span>
        {page === 'detail' && (
          <button className="back-button" onClick={backToList} type="button" aria-label="Torna ai percorsi">←</button>
        )}
      </header>

      {page === 'detail' ? (
        <main className="detail-page">
          {detailLoading ? (
            <div className="center-state"><span className="loader" />Caricamento percorso…</div>
          ) : detailError ? (
            <div className="center-state error-state"><p>{detailError}</p><button className="text-button" onClick={backToList} type="button">Torna ai percorsi</button></div>
          ) : selected ? (
            <>
              <section className="detail-heading">
                <span className="eyebrow">PERCORSO SALVATO</span>
                <h1>{selected.name}</h1>
                <p className="detail-date">{formatDate(selected.createdAt)}</p>
              </section>
              <section className="detail-map-wrap">
                <MapView detail={selected} className="detail-map" />
                <span className="map-label"><span /> PERCORSO</span>
              </section>
              <div className="detail-content">
                <section className="metric-row" aria-label="Dati del percorso">
                  <div className="metric"><span>DISTANZA</span><strong>{formatDistance(selected.distance) || '—'}</strong></div>
                  <div className="metric"><span>DISLIVELLO +</span><strong>{selected.ascent ? `${selected.ascent} m` : '—'}</strong></div>
                  <div className="metric"><span>PUNTI</span><strong>{selected.coordinates?.length?.toLocaleString('it-IT') || '—'}</strong></div>
                </section>
                <ElevationChart values={selected.elevation} />
                {selected.waypoints?.length > 0 && (
                  <section className="waypoints-section">
                    <div className="section-heading">
                      <div><span className="eyebrow">SUL CAMMINO</span><h2>Tappe</h2></div>
                      <span className="waypoint-count">{selected.waypoints.length}</span>
                    </div>
                    <ol className="waypoint-list">
                      {selected.waypoints.slice(0, 12).map((waypoint, index) => (
                        <li key={`${waypoint.name || 'tappa'}-${index}`}>
                          <span className="waypoint-dot">{index + 1}</span>
                          <span>{waypoint.name || `Tappa ${index + 1}`}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
                <div className="gpx-actions">
                  <button className="download-button orux-button" onClick={openWithOruxMaps} type="button">
                    <span aria-hidden="true">↗</span> Apri con OruxMaps
                  </button>
                  <button className="download-secondary" onClick={downloadGpx} type="button">
                    Scarica GPX
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </main>
      ) : page === 'map' ? (
        <main className="map-page">
          <div className="map-page-heading">
            <div><span className="eyebrow">TUTTI I SENTIERI</span><h1>La tua mappa</h1></div>
            <button className="map-count" type="button" onClick={() => setPage('home')}>{items.length} percorsi</button>
          </div>
          {loading && <div className="map-loading"><span className="loader" /></div>}
          {error && <div className="inline-error">{error}</div>}
          <MapView items={pageItems} onSelect={openItem} className="overview-map" />
          <p className="map-hint">Tocca un segnaposto per aprire il percorso</p>
        </main>
      ) : (
        <main className="home-page">
          <section className="hero">
            <div className="hero-copy">
              <span className="hero-kicker"><span className="live-dot" /> IL PROSSIMO PASSO È TUO</span>
              <h1>Segui la strada<br />che ti somiglia.</h1>
              <p>I tuoi sentieri, raccolti in un unico posto.</p>
            </div>
            <div className="hero-landscape" aria-hidden="true">
              <svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice">
                <path d="M0 139 68 76l33 38 59-73 47 62 35-45 82 91v51H0z" fill="#809278" opacity=".58" />
                <path d="m0 160 68-45 39 22 52-59 46 58 45-30 65 34 45-27v87H0z" fill="#a9b49a" opacity=".72" />
                <path d="m0 181 76-35 42 17 51-37 47 35 50-21 94 32v28H0z" fill="#d4d7c6" />
                <path d="M26 166c31-19 30-45 68-44s39 21 67 0 35-42 61-28 32 51 66 40 36 7 52 15" fill="none" stroke="#f4efe3" strokeWidth="2" strokeDasharray="3 7" opacity=".9" />
                <circle cx="221" cy="95" r="4" fill="#fffaf0" />
              </svg>
            </div>
            <span className="hero-index">ITINERARI E TRACCE, INSIEME</span>
          </section>

          <section className="stats-strip" aria-label="Riepilogo dei percorsi">
            <div><strong>{loading ? '—' : items.length}</strong><span>PERCORSI UNICI · TRACCE GPX E ITINERARI RIUNITI</span></div>
          </section>

          <section className="saved-section">
            <div className="section-heading list-heading">
              <div><span className="eyebrow">PRONTI A PARTIRE</span><h2>I tuoi percorsi</h2></div>
              <button className="map-link" onClick={() => setPage('map')} type="button">Apri mappa <span aria-hidden="true">↗</span></button>
            </div>

            <label className="search-box">
              <span aria-hidden="true" className="search-icon">⌕</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca un cammino..." aria-label="Cerca un cammino" />
              {query && <button type="button" onClick={() => setQuery('')} aria-label="Cancella ricerca">×</button>}
            </label>

            {loading ? (
              <div className="center-state"><span className="loader" />Caricamento dei tuoi percorsi…</div>
            ) : error ? (
              <div className="empty-state error-state">
                <span className="empty-icon">!</span>
                <strong>Non riesco a raggiungere i sentieri</strong>
                <p>{error}</p>
                <button className="text-button" onClick={loadItems} type="button">Riprova</button>
              </div>
            ) : filteredItems.length ? (
              <div className="route-list">
                {filteredItems.slice(0, 30).map((item) => <RouteCard key={`${item.type}-${item.id}`} item={item} onOpen={openItem} />)}
                {filteredItems.length > 30 && <p className="list-limit">Mostrati i primi 30 risultati. Usa la ricerca per trovare gli altri.</p>}
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">⌕</span>
                <strong>Nessun percorso trovato</strong>
                <p>Prova a cambiare la ricerca o il filtro.</p>
              </div>
            )}
          </section>
        </main>
      )}

      {notice && <div className="toast" role="status">{notice}</div>}
      {page !== 'detail' && <BottomNav page={page} onChange={setPage} />}
    </div>
  )
}

export default App
