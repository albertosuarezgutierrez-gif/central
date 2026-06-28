'use client'

import { useEffect, useRef } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    L?: any
  }
}

// Carga Leaflet desde CDN una sola vez (sin dependencia npm; gratis con OpenStreetMap).
let leafletPromise: Promise<any> | null = null
function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    const s = document.createElement('script')
    s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    s.async = true
    s.onload = () => resolve(window.L)
    s.onerror = () => reject(new Error('no se pudo cargar Leaflet'))
    document.body.appendChild(s)
  })
  return leafletPromise
}

export interface MarcadorVehiculo {
  vehiculoId: string
  nombre: string
  lat: number
  lng: number
  velocidadKmh?: number | null
  viva?: boolean
}
export interface PuntoRuta {
  lat: number
  lng: number
  nombre?: string | null
  tipo?: string | null
}

export default function MapaLeaflet({
  vehiculos,
  ruta,
  alturaPx = 480,
}: {
  vehiculos: MarcadorVehiculo[]
  ruta?: PuntoRuta[]
  alturaPx?: number
}) {
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const fittedRef = useRef(false)

  function dibujar(L: any) {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const pts: [number, number][] = []

    if (ruta && ruta.length) {
      const linea = ruta.map((r) => [r.lat, r.lng] as [number, number])
      if (linea.length >= 2) L.polyline(linea, { color: '#4f8cff', weight: 3, opacity: 0.7 }).addTo(layer)
      ruta.forEach((r, i) => {
        pts.push([r.lat, r.lng])
        L.circleMarker([r.lat, r.lng], { radius: 6, color: '#4f8cff', fillColor: '#4f8cff', fillOpacity: 0.85, weight: 1 })
          .bindPopup(`${i + 1}. ${r.nombre || r.tipo || 'parada'}`)
          .addTo(layer)
      })
    }

    vehiculos.forEach((v) => {
      pts.push([v.lat, v.lng])
      const color = v.viva === false ? '#9aa0aa' : '#22c55e'
      L.circleMarker([v.lat, v.lng], { radius: 9, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
        .bindPopup(
          `🚚 <b>${v.nombre}</b>` +
            (v.velocidadKmh != null ? `<br>${Math.round(v.velocidadKmh)} km/h` : '') +
            (v.viva === false ? '<br><i>señal perdida</i>' : ''),
        )
        .addTo(layer)
    })

    if (pts.length && !fittedRef.current) {
      try {
        mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 14 })
        fittedRef.current = true
      } catch {
        /* noop */
      }
    }
  }

  useEffect(() => {
    let cancel = false
    loadLeaflet()
      .then((L) => {
        if (cancel || !divRef.current) return
        if (!mapRef.current) {
          mapRef.current = L.map(divRef.current).setView([37.3886, -5.9823], 11)
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
          }).addTo(mapRef.current)
          layerRef.current = L.layerGroup().addTo(mapRef.current)
        }
        dibujar(L)
      })
      .catch(() => {})
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined' && window.L && mapRef.current) dibujar(window.L)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiculos, ruta])

  return (
    <div
      ref={divRef}
      style={{ width: '100%', height: alturaPx, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}
    />
  )
}
