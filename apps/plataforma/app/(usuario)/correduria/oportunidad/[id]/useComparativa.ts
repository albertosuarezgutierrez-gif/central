'use client'

// La comparativa de la oportunidad, leída UNA vez para la pantalla (21/10/2026): la usan el aviso de «ya hay una
// cotización de Avant2» (antes del botón de 0,50€) y el bloque de la comparativa. Se relee al cambiar `clave`
// (variantes: tras pedir precio) o con `recargar`. Gratis: el puerto solo lee lo guardado.

import { useCallback, useEffect, useState } from 'react'
import { interpretarComparativa, type LecturaComparativa } from '@/lib/correduria/comparativa-asegura'

export function useComparativa(oportunidadId: string, clave: string) {
  const [lectura, setLectura] = useState<LecturaComparativa | null>(null)
  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`/api/correduria/oportunidad/comparativa?oportunidadId=${encodeURIComponent(oportunidadId)}`, { cache: 'no-store' })
      setLectura(interpretarComparativa(res.status, await res.json().catch(() => null)))
    } catch {
      setLectura({ estado: 'error', motivo: 'red' })
    }
  }, [oportunidadId])
  useEffect(() => { void cargar() }, [cargar, clave])
  return { lectura, recargar: cargar }
}
