// Reglas PURAS del cotizador EMBEBIDO en la oportunidad (07/10/2026 moto, 10/10/2026 auto y hogar; Fase 1 «la
// oportunidad es la única página»). El cotizador lee el objeto (vehículo o vivienda) y las figuras del RIESGO; si eso
// cambia mientras está abierto, lo que tiene en memoria es el riesgo ANTERIOR y pagar 0,50€ con él sería cotizar otro
// vehículo, otra casa u otras personas.
// Lo cubre `cotizador-embebido.test.ts`.
//
// QUÉ ramos se cotizan dentro de la oportunidad lo decide `RAMOS_COTIZADOR_EMBEBIDO` (aquí, puro) y QUÉ componente
// los monta, `COTIZADOR_EMBEBIDO` (`cotizadores-embebidos.tsx`, que el tipo obliga a tener completo). Un ramo que no
// está en la lista sigue como siempre: enlace a su pantalla `…-nuevo?oportunidad=` (`rutaVariante`).

import type { Riesgo } from '@/lib/riesgo-asegura'
import { ramoVariante, rutaVariante, type RamoVarianteNuevo } from './variante.ts'

/** Los ramos con cotizador embebido en el bloque «Pedir precio» del riesgo. Añadir uno = alta en `COTIZADOR_EMBEBIDO`. */
export const RAMOS_COTIZADOR_EMBEBIDO = ['auto', 'moto', 'hogar'] as const satisfies readonly RamoVarianteNuevo[]
export type RamoCotizadorEmbebido = (typeof RAMOS_COTIZADOR_EMBEBIDO)[number]

export function ramoCotizadorEmbebido(ramo: string | null | undefined): RamoCotizadorEmbebido | null {
  return typeof ramo === 'string' && (RAMOS_COTIZADOR_EMBEBIDO as readonly string[]).includes(ramo) ? (ramo as RamoCotizadorEmbebido) : null
}

/** El ancla del bloque «Pedir precio» de la pantalla del riesgo. Llegar con ella ABRE el cotizador embebido (gratis). */
export const ANCLA_PEDIR_PRECIO = 'pedir-precio'

/**
 * A dónde se va a pedir precio de una oportunidad: con cotizador embebido, a la PROPIA oportunidad (`#pedir-precio`);
 * si no, a la pantalla de precio del ramo (`…-nuevo?oportunidad=`). Ninguna de las dos cotiza: allí se confirma (0,50€).
 */
export function rutaPedirPrecio(ramo: RamoVarianteNuevo, tomadorId: string, oportunidadId: string): string {
  return ramoCotizadorEmbebido(ramo)
    ? `/correduria/oportunidad/${encodeURIComponent(oportunidadId)}#${ANCLA_PEDIR_PRECIO}`
    : rutaVariante(ramo, tomadorId, oportunidadId)
}

/** ¿Hay que abrir el cotizador embebido al cargar la pantalla? Solo si se llega con el ancla y el ramo lo tiene. */
export function abrirAlCargar(hash: string, ramo: string): boolean {
  return hash === `#${ANCLA_PEDIR_PRECIO}` && ramoCotizadorEmbebido(ramoVariante(ramo)) !== null
}

const sinSello = (d: Record<string, unknown> | null): Record<string, unknown> | null =>
  d === null ? null : Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'confirmadoAt').sort(([a], [b]) => a.localeCompare(b)))

/**
 * Huella de lo que el cotizador usa del riesgo: el objeto —el vehículo, o el bloque de datos del ramo (la vivienda en
 * hogar)— sin el sello de confirmación (que no cambia ningún dato), los papeles y quién ocupa cada uno (con lo que le
 * falta en su ficha). Dos lecturas con la misma huella cotizan lo mismo. Las variantes NO entran: pedir precio añade
 * una y eso no hace viejas las condiciones. Los papeles de varias personas (asegurados) entran por ficha, ordenados.
 */
export function firmaRiesgo(r: Riesgo): string {
  const vehiculo = sinSello(r.datosVehiculo as Record<string, unknown> | null)
  // El bloque de datos de los ramos que no son de vehículo (en auto/moto es el mismo vehículo: no se repite).
  const b = r.datosRiesgo
  const objeto = b === null || b.clave === 'datosVehiculo' ? null : { clave: b.clave, datos: sinSello(b.datos as unknown as Record<string, unknown>) }
  const figuras = [...r.figuras]
    .map((f) => ({ rol: f.rol, clienteId: f.clienteId, empresa: f.empresa, faltan: f.faltan === null ? null : [...f.faltan].sort() }))
    .sort((a, b) => a.rol.localeCompare(b.rol) || a.clienteId.localeCompare(b.clienteId))
  // El cliente de la oportunidad entra: sin figura «tomador», el tomador ES él (`tomadorDelRiesgo`).
  return JSON.stringify({ oportunidad: r.oportunidad.id, cliente: r.oportunidad.clienteId, ramo: r.oportunidad.ramo, roles: [...r.roles].sort(), vehiculo, objeto, figuras })
}

/** @deprecated nombres de cuando solo había vehículo: es la misma huella para cualquier ramo. */
export const firmaRiesgoVehiculo = firmaRiesgo
/** @deprecated ver `firmaRiesgoVehiculo`. */
export const firmaRiesgoMoto = firmaRiesgo

/** El nombre del bloque del objeto del riesgo en la pantalla, para decir qué hay a medias arriba. */
export function bloqueObjetoDeRamo(ramo: string): string {
  return ramo === 'auto' || ramo === 'moto' ? 'Datos del vehículo' : ramo === 'hogar' ? 'Datos de la vivienda' : 'Datos del riesgo'
}

/**
 * Por qué AHORA no se puede pedir precio desde el cotizador embebido (`null` = nada lo impide). Orden: lo que el
 * corredor tiene a medias arriba manda (así sabe qué cerrar); después, la relectura en curso; después, el desfase.
 */
export function motivoBloqueoCotizador(e: {
  /** El bloque del objeto (vehículo, vivienda…) tiene una edición a medias. */
  editandoObjeto: boolean
  /** Su nombre en pantalla (`bloqueObjetoDeRamo`). Sin él, «Datos del vehículo» (el de siempre). */
  objeto?: string
  editandoFiguras: boolean
  recargando: boolean
  /** La pantalla ya trae OTRO riesgo que el que se leyó al abrir el cotizador. */
  riesgoCambiado: boolean
  /** Lo que el servidor leyó al abrir no coincide con lo que pinta la pantalla. */
  pantallaDesfasada: boolean
}): string | null {
  if (e.editandoObjeto) return `Estás editando «${e.objeto ?? 'Datos del vehículo'}»: guarda o cancela antes de pedir precio (se cotiza con lo guardado).`
  if (e.editandoFiguras) return 'Estás cambiando «Intervinientes»: termina antes de pedir precio (se cotiza con las personas guardadas).'
  if (e.recargando) return 'Releyendo el riesgo…'
  if (e.riesgoCambiado) return 'Los datos del riesgo han cambiado: se están volviendo a leer las condiciones. No se pide precio con los anteriores.'
  if (e.pantallaDesfasada) return 'Lo que hay guardado no coincide con lo de esta pantalla: se está releyendo el riesgo. No se pide precio hasta que coincidan.'
  return null
}
