'use client'

import { useEffect, useRef, useState } from 'react'
import { simularTrayecto, tieneSenal } from '@central/module-geo'
import MapaLeaflet, { type MarcadorVehiculo, type PuntoRuta } from '../../_components/MapaLeaflet'
import type { PosicionView } from '@/lib/transporte-repo'

export default function MapaOperador({
  posicionesIniciales,
  ruta,
}: {
  posicionesIniciales: PosicionView[]
  ruta: PuntoRuta[]
}) {
  const [posiciones, setPosiciones] = useState<PosicionView[]>(posicionesIniciales)
  const [simulando, setSimulando] = useState(false)
  const simRef = useRef<number | null>(null)

  // Polling de posiciones reales cada 5s (en pausa mientras se simula).
  useEffect(() => {
    if (simulando) return
    const t = setInterval(async () => {
      try {
        const res = await fetch('/api/mapa/posiciones', { cache: 'no-store' })
        if (res.ok) {
          const j = await res.json()
          setPosiciones(j.posiciones ?? [])
        }
      } catch {
        /* reintenta al siguiente tick */
      }
    }, 5000)
    return () => clearInterval(t)
  }, [simulando])

  useEffect(() => () => { if (simRef.current) window.clearInterval(simRef.current) }, [])

  const ahora = new Date().toISOString()
  const marcadores: MarcadorVehiculo[] = posiciones.map((p) => ({
    vehiculoId: p.vehiculoId,
    nombre: p.nombre,
    lat: p.lat,
    lng: p.lng,
    velocidadKmh: p.velocidadKmh,
    viva: tieneSenal({ lat: p.lat, lng: p.lng, capturadoAt: p.capturadoAt }, ahora, 60),
  }))

  function simular() {
    const base: { lat: number; lng: number }[] =
      ruta.length >= 2
        ? ruta.map((r) => ({ lat: r.lat, lng: r.lng }))
        : posiciones.length
          ? [
              { lat: posiciones[0].lat, lng: posiciones[0].lng },
              { lat: posiciones[0].lat + 0.05, lng: posiciones[0].lng + 0.04 },
            ]
          : [
              { lat: 37.3886, lng: -5.9823 },
              { lat: 37.42, lng: -5.93 },
            ]
    const traza = simularTrayecto(base, 30)
    setSimulando(true)
    let i = 0
    if (simRef.current) window.clearInterval(simRef.current)
    simRef.current = window.setInterval(() => {
      const pt = traza[i]
      setPosiciones([
        { vehiculoId: 'sim', nombre: '🚚 Demo (simulación)', lat: pt.lat, lng: pt.lng, velocidadKmh: 45, capturadoAt: new Date().toISOString() },
      ])
      i++
      if (i >= traza.length && simRef.current) window.clearInterval(simRef.current)
    }, 500)
  }

  function pararSim() {
    if (simRef.current) window.clearInterval(simRef.current)
    setSimulando(false)
    setPosiciones(posicionesIniciales)
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Mapa de la flota</h2>
        <span className="muted">{marcadores.length} vehículo(s) con señal</span>
        <div style={{ marginLeft: 'auto' }}>
          {!simulando ? (
            <button className="primary" style={{ width: 'auto', padding: '8px 14px' }} onClick={simular}>
              ▶ Simular ruta
            </button>
          ) : (
            <button style={{ width: 'auto', padding: '8px 14px' }} onClick={pararSim}>
              ■ Parar simulación
            </button>
          )}
        </div>
      </div>
      <MapaLeaflet vehiculos={marcadores} ruta={ruta} />
      {marcadores.length === 0 && !simulando && (
        <p className="muted" style={{ marginTop: 10 }}>
          Sin señal de ningún vehículo todavía. Pulsa <strong>▶ Simular ruta</strong> para ver la demo, o comparte el
          enlace del conductor para recibir su GPS real.
        </p>
      )}
    </div>
  )
}
