'use client'

// Catálogos de hogar de Codeoscopic (gratis: solo leen) que traducen lo guardado en la vivienda a las elecciones del bot (uso,
// régimen, tipo). Los usan «Bots (gratis)» de hogar y «Para tarificar faltan»: se leen UNA vez por página (promesa compartida),
// no una por bloque. Un catálogo que no se puede leer NO inventa nada (queda fuera y solo valen los ids atestiguados).
import { useEffect, useState } from 'react'
import type { CatalogosHogarLeidos } from '@/lib/tarificador-hogar-formulario'
import { pedirCatalogo } from '../../cliente/[id]/auto-nuevo/acciones'

const CATALOGOS: ReadonlyArray<{ clave: keyof CatalogosHogarLeidos; nombre: string }> = [
  { clave: 'tipoVivienda', nombre: 'property-types' },
  { clave: 'ocupacion', nombre: 'occupancy-types' },
  { clave: 'uso', nombre: 'uses' },
]

/** Lo leído y si se leyeron TODOS (con alguno caído, lo que dependa de él es «sin comprobar»). */
export type CatalogosHogar = { catalogos: CatalogosHogarLeidos; completos: boolean }

let compartida: Promise<CatalogosHogar> | null = null

function leerCatalogos(): Promise<CatalogosHogar> {
  if (!compartida) {
    compartida = Promise.all(CATALOGOS.map(async (c) => {
      try {
        const r = await pedirCatalogo({ tipo: 'hogar', nombre: c.nombre })
        return [c.clave, r.estado === 'ok' ? r.opciones : undefined] as const
      } catch {
        return [c.clave, undefined] as const
      }
    })).then((pares) => {
      const leidos = pares.filter(([, v]) => v !== undefined)
      const r = { catalogos: Object.fromEntries(leidos) as CatalogosHogarLeidos, completos: leidos.length === CATALOGOS.length }
      // Un fallo no se queda cacheado: la próxima vez que se pida se vuelve a intentar.
      if (!r.completos) compartida = null
      return r
    })
  }
  return compartida
}

/** `null` = aún leyéndose. `activo: false` = no se pide nada (otro ramo). */
export function useCatalogosHogar(activo = true): CatalogosHogar | null {
  const [r, setR] = useState<CatalogosHogar | null>(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    void leerCatalogos().then((x) => { if (vivo) setR(x) })
    return () => { vivo = false }
  }, [activo])
  return r
}
