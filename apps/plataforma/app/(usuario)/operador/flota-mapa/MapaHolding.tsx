'use client'

import { useEffect, useRef, useState } from 'react'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    L?: any
  }
}

// Leaflet por CDN (gratis con OpenStreetMap, sin dependencia npm).
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
    s.onerror = () => reject(new Error('leaflet'))
    document.body.appendChild(s)
  })
  return leafletPromise
}

interface Pos {
  vehiculoId: string
  vehiculo: string
  cuenta: string | null
  lat: number
  lng: number
  velocidadKmh: number | null
  capturadoAt: string
}

const viva = (iso: string) => (Date.now() - new Date(iso).getTime()) / 1000 <= 60

export default function MapaHolding({ posicionesIniciales }: { posicionesIniciales: Pos[] }) {
  const [pos, setPos] = useState<Pos[]>(posicionesIniciales)
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const fittedRef = useRef(false)

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch('/api/operador/flota-mapa', { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          setPos(j.posiciones ?? [])
        }
      } catch {
        /* reintenta */
      }
    }, 7000)
    return () => clearInterval(t)
  }, [])

  function dibujar(L: any) {
    const layer = layerRef.current
    if (!layer) return
    layer.clearLayers()
    const pts: [number, number][] = []
    pos.forEach((p) => {
      pts.push([p.lat, p.lng])
      const color = viva(p.capturadoAt) ? '#16a34a' : '#9aa0aa'
      L.circleMarker([p.lat, p.lng], { radius: 9, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
        .bindPopup(
          `🚚 <b>${p.vehiculo}</b>` +
            (p.cuenta ? `<br>${p.cuenta}` : '') +
            (p.velocidadKmh != null ? `<br>${Math.round(p.velocidadKmh)} km/h` : '') +
            (viva(p.capturadoAt) ? '' : '<br><i>señal perdida</i>'),
        )
        .addTo(layer)
    })
    if (pts.length && !fittedRef.current) {
      try {
        mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 13 })
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
          mapRef.current = L.map(divRef.current).setView([37.3886, -5.9823], 9)
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
  }, [pos])

  return (
    <div>
      <div
        ref={divRef}
        style={{ width: '100%', height: 520, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}
      />
      <div style={{ marginTop: 12, fontSize: 13 }}>
        {pos.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Sin señal de ningún vehículo del grupo todavía.</p>
        ) : (
          pos.map((p) => (
            <div key={p.vehiculoId} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 8,
                  background: viva(p.capturadoAt) ? 'var(--positive)' : '#9aa0aa',
                  display: 'inline-block',
                }}
              />
              <strong>{p.vehiculo}</strong>
              <span style={{ color: 'var(--muted)' }}>{p.cuenta || ''}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                {viva(p.capturadoAt)
                  ? p.velocidadKmh != null
                    ? Math.round(p.velocidadKmh) + ' km/h'
                    : 'en línea'
                  : 'señal perdida'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
