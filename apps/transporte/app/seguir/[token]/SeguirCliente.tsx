'use client'

import { useEffect, useState } from 'react'
import { etaMin } from '@central/module-geo'
import MapaLeaflet, { type PuntoRuta } from '../../_components/MapaLeaflet'

interface Pos {
  vehiculoId: string
  nombre: string
  lat: number
  lng: number
  velocidadKmh: number | null
  capturadoAt: string
}

export default function SeguirCliente({
  token,
  cliente,
  destino,
  ruta,
  posicionesIniciales,
}: {
  token: string
  cliente: string | null
  destino: string | null
  ruta: PuntoRuta[]
  posicionesIniciales: Pos[]
}) {
  const [pos, setPos] = useState<Pos[]>(posicionesIniciales)

  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/seguir/${token}`, { cache: 'no-store' })
        if (r.ok) {
          const j = await r.json()
          setPos(j.posiciones ?? [])
        }
      } catch {
        /* reintenta */
      }
    }, 5000)
    return () => clearInterval(t)
  }, [token])

  const destinoPt = ruta.length ? ruta[ruta.length - 1] : null
  const v = pos[0]
  const eta =
    v && destinoPt
      ? etaMin({ lat: v.lat, lng: v.lng }, { lat: destinoPt.lat, lng: destinoPt.lng }, v.velocidadKmh && v.velocidadKmh > 5 ? v.velocidadKmh : 30)
      : null

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16 }}>
      <h2 style={{ marginBottom: 4 }}>📦 Seguimiento de tu envío</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        {cliente ? cliente + ' · ' : ''}
        {destino ? 'Destino: ' + destino : ''}
      </p>
      {v ? (
        <p style={{ fontSize: 18 }}>
          🚚 En camino{eta != null ? <> · llega en <strong>~{Math.max(1, Math.round(eta))} min</strong></> : ''}
        </p>
      ) : (
        <p className="muted">Aún sin señal del vehículo. Aparecerá aquí en cuanto inicie el servicio.</p>
      )}
      <MapaLeaflet vehiculos={pos.map((p) => ({ ...p, viva: true }))} ruta={ruta} />
    </main>
  )
}
