// Lo que las pantallas de pedir precio (auto-nuevo, moto-nuevo) necesitan saber del riesgo cuando
// cotizan una VARIANTE (29/09/2026, docs/superpowers/specs/2026-09-29-riesgo-figuras-variantes-design.md).
// PURO y server-safe: se calcula en el `page.tsx` a partir de la lectura del riesgo y viaja como prop.

import type { RolFigura } from '@central/module-seguros'
import type { Riesgo } from '@/lib/riesgo-asegura'

/** Los papeles que NO son el tomador: los que una variante puede poner en otra ficha. */
export type RolExtra = 'propietario' | 'conductor_habitual' | 'conductor_ocasional'
export const ROLES_EXTRA: readonly RolExtra[] = ['propietario', 'conductor_habitual', 'conductor_ocasional']

export type VarianteNueva = {
  oportunidadId: string
  /** La variante que se abre (`?tarificacion=`); `null` = variante nueva. */
  tarificacionId: string | null
  /** «2121NST · Yamaha MT-07», lo que haya; `null` = el riesgo no lo trae. */
  etiqueta: string | null
  /** Solo los papeles que ocupa OTRA ficha distinta del tomador de esta pantalla. */
  figuras: Partial<Record<RolExtra, string>>
  nombres: Partial<Record<RolFigura, string>>
  /** Lo que falta en su ficha para cotizar. `null` = no se pudo leer (no «nada falta»). */
  faltan: Partial<Record<RolFigura, string[] | null>>
}

export function etiquetaRiesgo(r: Riesgo): string | null {
  const partes = [r.oportunidad.matricula, r.oportunidad.vehiculo].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  return partes.length > 0 ? partes.join(' · ') : null
}

/**
 * La variante para la pantalla de `tomadorId`. Una figura cuya ficha ES el tomador no viaja: el
 * servidor ya pone al tomador en todos los papeles vacíos.
 */
export function varianteDeRiesgo(r: Riesgo, tomadorId: string, tarificacionId: string | null): VarianteNueva {
  const figuras: VarianteNueva['figuras'] = {}
  const nombres: VarianteNueva['nombres'] = {}
  const faltan: VarianteNueva['faltan'] = {}
  for (const f of r.figuras) {
    nombres[f.rol] = f.nombre
    faltan[f.rol] = f.faltan
    if (f.rol !== 'tomador' && f.clienteId !== tomadorId && r.roles.includes(f.rol)) figuras[f.rol as RolExtra] = f.clienteId
  }
  return { oportunidadId: r.oportunidad.id, tarificacionId, etiqueta: etiquetaRiesgo(r), figuras, nombres, faltan }
}

/** El tomador vigente del riesgo: la figura `tomador` o, si no consta, el cliente de la oportunidad. */
export function tomadorDelRiesgo(r: Riesgo): string {
  return r.figuras.find((f) => f.rol === 'tomador')?.clienteId ?? r.oportunidad.clienteId
}

/** Solo auto y moto se cotizan desde la pantalla del riesgo (hogar y el resto, desde la ficha). */
export function ramoVariante(ramo: string): 'auto' | 'moto' | null {
  return ramo === 'auto' || ramo === 'moto' ? ramo : null
}

/**
 * Retarificar la PÓLIZA dentro de su riesgo (`/poliza/{id}/retarificar?oportunidad=`): auto, moto y
 * hogar (29/09/2026). Distinto de `ramoVariante`: hogar se retarifica con las mismas personas, pero
 * no tiene pantalla de «otro tomador» (hogar-nuevo no lee `?oportunidad=`).
 */
export function retarificaEnRiesgo(ramo: string): boolean {
  return ramo === 'auto' || ramo === 'moto' || ramo === 'hogar'
}

export function rutaVariante(ramo: 'auto' | 'moto', tomadorId: string, oportunidadId: string, tarificacionId?: string | null): string {
  const q = new URLSearchParams({ oportunidad: oportunidadId })
  if (tarificacionId) q.set('tarificacion', tarificacionId)
  return `/correduria/cliente/${encodeURIComponent(tomadorId)}/${ramo}-nuevo?${q.toString()}`
}

/** `searchParams` → un texto limpio o `null` (uuid u otro id opaco; nunca un array). */
export function paramTexto(v: string | string[] | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' && v.length <= 80 ? v.trim() : null
}
