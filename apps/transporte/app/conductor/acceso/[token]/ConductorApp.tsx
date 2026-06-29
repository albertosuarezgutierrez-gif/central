'use client'

import { useEffect, useRef, useState } from 'react'

interface PorteItem {
  id: string
  vehiculoNombre: string
  cliente: string | null
  origen: string | null
  destino: string | null
  estado: string
}

export default function ConductorApp({
  token,
  conductor,
  portes,
}: {
  token: string
  conductor: string
  portes: PorteItem[]
}) {
  const [porteId, setPorteId] = useState(portes[0]?.id ?? '')
  const [activo, setActivo] = useState(false)
  const [estado, setEstado] = useState('')
  const watchRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (watchRef.current != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchRef.current)
    },
    [],
  )

  function iniciar() {
    if (!porteId) {
      setEstado('No tienes ningún servicio asignado.')
      return
    }
    if (!('geolocation' in navigator)) {
      setEstado('Este dispositivo no permite compartir ubicación.')
      return
    }
    setActivo(true)
    setEstado('Compartiendo ubicación…')
    watchRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        try {
          await fetch('/api/conductor/posicion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token,
              porteId,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              velocidad: pos.coords.speed != null ? pos.coords.speed * 3.6 : null,
              rumbo: pos.coords.heading,
            }),
          })
          setEstado('📍 Ubicación enviada · ' + new Date().toLocaleTimeString())
        } catch {
          setEstado('Sin conexión; se reintentará automáticamente.')
        }
      },
      (err) => setEstado('No se pudo obtener la ubicación: ' + err.message),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
  }

  function parar() {
    if (watchRef.current != null && 'geolocation' in navigator) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setActivo(false)
    setEstado('Servicio finalizado. Ya no se comparte tu ubicación.')
  }

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: 20 }}>
      <h2 style={{ marginBottom: 4 }}>🚚 Conductor</h2>
      <p className="muted" style={{ marginTop: 0 }}>{conductor}</p>

      <label className="muted" style={{ fontSize: 13 }}>Servicio</label>
      <select
        value={porteId}
        onChange={(e) => setPorteId(e.target.value)}
        disabled={activo}
        style={{ width: '100%', marginBottom: 14, padding: 10 }}
      >
        {portes.length === 0 && <option value="">(sin servicios asignados)</option>}
        {portes.map((p) => (
          <option key={p.id} value={p.id}>
            {p.vehiculoNombre} · {p.cliente || p.destino || 'porte'} ({p.estado})
          </option>
        ))}
      </select>

      {!activo ? (
        <button className="primary" style={{ width: '100%', padding: 16, fontSize: 18 }} onClick={iniciar}>
          ▶ Iniciar servicio y compartir ubicación
        </button>
      ) : (
        <button style={{ width: '100%', padding: 16, fontSize: 18 }} onClick={parar}>
          ■ Finalizar servicio (dejar de compartir)
        </button>
      )}

      {estado && <p className="muted" style={{ marginTop: 12 }}>{estado}</p>}

      <p className="muted" style={{ fontSize: 12, marginTop: 18, lineHeight: 1.55 }}>
        Se comparte la ubicación del <strong>vehículo</strong> únicamente mientras el servicio está activo, con la
        finalidad de gestión logística y de atención al cliente. Puedes detenerlo en cualquier momento al terminar; no
        se rastrea fuera del servicio. (Información conforme al art. 90 LOPDGDD.)
      </p>
    </main>
  )
}
