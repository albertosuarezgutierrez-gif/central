'use client'
import { useEffect, useState } from 'react'
import { interpretarCompanias, type RespuestaCompanias } from '@/lib/companias-asegura'

/**
 * El directorio de compañías (`GET /api/correduria/companias`), en un hook
 * compartido (20/09/2026) — antes lo repetían `Companias.tsx` y `Siniestros.tsx`
 * cada uno con su propio `useEffect`+`fetch`, con riesgo de que un cambio en
 * cómo se pide o se interpreta el directorio se hiciera en un sitio y no en
 * el otro. `{ fase: 'cargando' }` mientras no ha llegado nada.
 */
export type EstadoCompanias = { fase: 'cargando' } | { fase: 'hecho'; r: RespuestaCompanias }

export function useCompanias(): EstadoCompanias {
  const [estado, setEstado] = useState<EstadoCompanias>({ fase: 'cargando' })

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/companias')
      .then(async (res) => interpretarCompanias(res.status, await res.json().catch(() => null)))
      .catch((): RespuestaCompanias => ({ estado: 'error', motivo: 'red' }))
      .then((r) => { if (vivo) setEstado({ fase: 'hecho', r }) })
    return () => { vivo = false }
  }, [])

  return estado
}
