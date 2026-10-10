'use client'
import { useCallback, useEffect, useState } from 'react'
import {
  interpretarAcuerdos,
  interpretarProductividad,
  type RespuestaAcuerdos,
  type RespuestaProductividad,
} from '@/lib/acuerdos-asegura'

/**
 * Acuerdos + claves y productividad de las compañías (`GET /api/correduria/companias/acuerdos`),
 * en un hook (fase 2, 06/10/2026). Cada mitad trae su propio estado: un fallo de la
 * productividad no esconde los acuerdos, y ninguno de los dos se pinta como «no hay».
 */
export type EstadoAcuerdos =
  | { fase: 'cargando' }
  | { fase: 'hecho'; acuerdos: RespuestaAcuerdos; productividad: RespuestaProductividad }

type Mitad = { status?: unknown; json?: unknown }

export function useAcuerdos(): EstadoAcuerdos & { recargar: () => void } {
  const [estado, setEstado] = useState<EstadoAcuerdos>({ fase: 'cargando' })
  const [n, setN] = useState(0)
  const recargar = useCallback(() => setN((x) => x + 1), [])

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/companias/acuerdos')
      .then(async (res) => {
        const j = (await res.json().catch(() => null)) as { acuerdos?: Mitad; productividad?: Mitad } | null
        if (!res.ok || !j) {
          const e = { estado: 'error' as const, motivo: `HTTP ${res.status}` }
          return { fase: 'hecho' as const, acuerdos: e, productividad: e }
        }
        const st = (m?: Mitad) => (typeof m?.status === 'number' ? m.status : 502)
        return {
          fase: 'hecho' as const,
          acuerdos: interpretarAcuerdos(st(j.acuerdos), j.acuerdos?.json),
          productividad: interpretarProductividad(st(j.productividad), j.productividad?.json),
        }
      })
      .catch((): EstadoAcuerdos => {
        const e = { estado: 'error' as const, motivo: 'red' }
        return { fase: 'hecho', acuerdos: e, productividad: e }
      })
      .then((x) => { if (vivo) setEstado(x) })
    return () => { vivo = false }
  }, [n])

  return { ...estado, recargar }
}
