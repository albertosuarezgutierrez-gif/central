'use client'
// Mapa nacional de subastas: todos los inmuebles vigentes geocodificados de un
// vistazo. Leaflet por CDN con OpenStreetMap (mismo patrón que el mapa de
// flota del god-panel, sin dependencia npm). Solo se monta al abrir la pestaña
// 🗺️ Mapa, así que la carga del script no la paga quien no lo usa.
import { useEffect, useRef, useState } from 'react'
import { direccionCatastro, urlFichaCatastro, urlGoogleMaps, urlStreetView } from '@central/module-subastas'
import { eur } from '@/lib/dinero'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    L?: any
  }
}

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

interface Punto {
  dedupeKey: string
  identificador: string | null
  tipoBien: string | null
  provincia: string | null
  municipio: string | null
  direccion: string | null
  direccionCatastro: string | null
  valorSubasta: number | null
  fechaFin: string | null
  url: string | null
  lat: number
  lon: number
  aproximado: boolean
  ocupada: boolean
  enRadar: boolean
  refCatastral: string | null
}

const TIPO_EMOJI: Record<string, string> = {
  vivienda: '🏠', garaje: '🅿️', local: '🏬', nave: '🏭', parcela: '🧱',
  finca_rustica: '🌾', trastero: '📦', edificio: '🏢',
}
// `Object.hasOwn`: un `tipo_bien` que se llamara «constructor» o «toString»
// devolvería la función heredada del prototipo (que no es nullish, así que el
// `??` no salta) y acabaría interpolada en el HTML del popup.
const emojiTipo = (t: string | null) => (t && Object.hasOwn(TIPO_EMOJI, t) ? TIPO_EMOJI[t] : '📌')

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
/** Solo http(s) sale como enlace: un `javascript:` colado por la ingesta se ejecutaría al pulsar. */
const enlace = (url: string | null, texto: string) =>
  url && /^https?:\/\//i.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noreferrer">${texto}</a>` : null

function popupHtml(p: Punto): string {
  // 🏛️ SOLO para la dirección del Catastro (el `ldt` oficial). La del anuncio
  // puede ser un párrafo del edicto y no merece ni el emoji ni mandar sobre las
  // coordenadas exactas — de eso se encarga `urlGoogleMaps`.
  const dirCat = direccionCatastro(p.direccionCatastro)
  const gm = urlGoogleMaps({ ...p, direccion: dirCat?.postal ?? p.direccion })
  const pano = p.aproximado ? null : urlStreetView(p.lat, p.lon)
  const cat = urlFichaCatastro(p.refCatastral)

  const partes = [
    `${emojiTipo(p.tipoBien)} <b>${esc(p.identificador ?? p.dedupeKey)}</b>`,
    dirCat ? `🏛️ ${esc(dirCat.postal)}` : p.direccion ? esc(p.direccion) : null,
    dirCat?.planta || dirCat?.puerta
      ? esc([dirCat.planta && `planta ${dirCat.planta}`, dirCat.puerta && `puerta ${dirCat.puerta}`].filter(Boolean).join(', '))
      : null,
    [p.municipio, p.provincia].filter(Boolean).map((x) => esc(x!)).join(' · ') || null,
    p.valorSubasta != null ? `salida <b>${eur(p.valorSubasta)}</b>` : null,
    p.fechaFin ? `⏰ cierra ${new Date(p.fechaFin).toLocaleDateString('es-ES')}` : null,
    p.aproximado ? '<i>📍 ubicación aproximada (centro del municipio)</i>' : null,
    p.ocupada ? '⚠️ ocupada / posesión dudosa' : null,
    p.enRadar ? '🎯 en tu radar' : null,
    [
      enlace(p.url, 'Ficha oficial'),
      enlace(gm, 'Mapa'),
      enlace(pano, 'Ver la calle'),
      enlace(cat, 'Catastro'),
    ].filter(Boolean).join(' · '),
  ]
  return partes.filter(Boolean).join('<br>')
}

export default function MapaSubastas() {
  const [puntos, setPuntos] = useState<Punto[] | null>(null)
  const [sinUbicar, setSinUbicar] = useState(0)
  const [omitidos, setOmitidos] = useState(0)
  const [error, setError] = useState(false)
  const [soloRadar, setSoloRadar] = useState(false)
  // 🚨 El «ya hay mapa» tiene que ser ESTADO, no una ref: antes el `.then` de
  // Leaflet llamaba a `dibujar` con la closure del PRIMER render (`puntos ===
  // null`) y, si el script tardaba más que la fetch, no se pintaba ni un
  // marcador — mapa vacío sin error, que se «arreglaba» solo al tocar el
  // checkbox 🎯. Con estado, el efecto de dibujo vuelve a correr cuando el mapa
  // está listo, con los puntos de verdad.
  const [listo, setListo] = useState(false)
  const divRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const layerRef = useRef<any>(null)
  const fittedRef = useRef(false)

  useEffect(() => {
    let cancel = false
    fetch('/api/subastas/mapa', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (cancel) return
        setPuntos(j.puntos ?? [])
        setSinUbicar(j.sinUbicar ?? 0)
        setOmitidos(j.omitidos ?? 0)
      })
      .catch(() => { if (!cancel) setError(true) })
    return () => { cancel = true }
  }, [])

  useEffect(() => {
    let cancel = false
    loadLeaflet()
      .then((L) => {
        if (cancel || !divRef.current) return
        if (!mapRef.current) {
          // España entera de arranque; con puntos se ajusta al corpus real.
          mapRef.current = L.map(divRef.current).setView([40.0, -3.7], 5)
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19,
          }).addTo(mapRef.current)
          layerRef.current = L.layerGroup().addTo(mapRef.current)
        }
        setListo(true)
      })
      .catch(() => setError(true))
    return () => { cancel = true }
  }, [])

  function dibujar(L: any) {
    const layer = layerRef.current
    if (!layer || !puntos) return
    layer.clearLayers()
    const visibles = soloRadar ? puntos.filter((p) => p.enRadar) : puntos
    // Los aproximados del mismo municipio caen todos en el MISMO centroide: se
    // abren en un anillo determinista (~300 m) para que cada pin sea clicable.
    const enPunto = new Map<string, number>()
    const pts: [number, number][] = []
    visibles.forEach((p) => {
      const clave = `${p.lat},${p.lon}`
      const i = enPunto.get(clave) ?? 0
      enPunto.set(clave, i + 1)
      const ang = (i * 2 * Math.PI) / 8
      const lat = i === 0 ? p.lat : p.lat + 0.003 * Math.sin(ang) * (1 + Math.floor(i / 8))
      const lon = i === 0 ? p.lon : p.lon + 0.003 * Math.cos(ang) * (1 + Math.floor(i / 8))
      pts.push([lat, lon])
      // En el lienzo de Leaflet no llegan los tokens CSS: hex fijos a propósito
      // (mismo trade-off que el mapa de flota).
      const color = p.enRadar ? '#4f46e5' : p.ocupada ? '#b45309' : '#16a34a'
      L.circleMarker([lat, lon], {
        radius: 9, color, fillColor: color, weight: 2,
        // Aproximado = hueco: se distingue de un punto exacto de un vistazo.
        fillOpacity: p.aproximado ? 0.15 : 0.85,
        dashArray: p.aproximado ? '3 3' : undefined,
      })
        // Perezoso: el HTML de cada popup (5 regex de `direccionCatastro` por
        // punto) solo se construye al abrirlo, no en cada repintado.
        .bindPopup(() => popupHtml(p))
        .addTo(layer)
    })
    if (pts.length && !fittedRef.current) {
      try {
        mapRef.current.fitBounds(pts, { padding: [40, 40], maxZoom: 12 })
        fittedRef.current = true
      } catch { /* noop */ }
    }
  }

  useEffect(() => {
    if (listo && typeof window !== 'undefined' && window.L && mapRef.current) dibujar(window.L)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puntos, soloRadar, listo])

  const enRadar = (puntos ?? []).filter((p) => p.enRadar).length

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10, fontSize: 13 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44, color: 'var(--text)' }}>
          <input type="checkbox" checked={soloRadar} onChange={(e) => setSoloRadar(e.target.checked)} />
          🎯 Solo mi radar {enRadar > 0 && `(${enRadar})`}
        </label>
        <span style={{ color: 'var(--muted)' }}>
          <span style={{ color: '#4f46e5' }}>●</span> radar · <span style={{ color: '#16a34a' }}>●</span> libre/desconocida ·{' '}
          <span style={{ color: '#b45309' }}>●</span> ocupada · <span style={{ color: '#16a34a' }}>○</span> ubicación aproximada
        </span>
      </div>

      <div
        ref={divRef}
        style={{ width: '100%', height: 'min(65vh, 560px)', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}
      />

      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
        {error
          ? 'No se ha podido cargar el mapa. Reintenta en un momento.'
          : puntos == null
            ? 'Cargando ubicaciones…'
            : `${puntos.filter((p) => !p.aproximado).length} inmuebles con la ubicación exacta del Catastro` +
              ` y ${puntos.filter((p) => p.aproximado).length} aproximados al centro de su municipio (sin referencia catastral publicada).` +
              (sinUbicar > 0
                ? ` Otros ${sinUbicar} vigentes siguen sin ubicar, pendientes de la próxima pasada de enriquecimiento.`
                : '') +
              (omitidos > 0 ? ` ⚠️ Hay ${omitidos} más ya ubicados que no caben en el mapa (se pintan los que cierran antes).` : '')}
      </p>
    </div>
  )
}
