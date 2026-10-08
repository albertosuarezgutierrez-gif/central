// Reglas PURAS del cotizador de moto EMBEBIDO en la oportunidad (07/10/2026, Fase 1 «la oportunidad es la única
// página»). El cotizador lee el vehículo y las figuras del RIESGO; si eso cambia mientras está abierto, lo que
// tiene en memoria es el riesgo ANTERIOR y pagar 0,50€ con él sería cotizar otra moto u otras personas.
// Lo cubre `cotizador-embebido.test.ts`.

import type { Riesgo } from '@/lib/riesgo-asegura'

/**
 * Huella de lo que el cotizador usa del riesgo: el vehículo (sin el sello de confirmación, que no cambia ningún
 * dato), los papeles y quién ocupa cada uno (con lo que le falta en su ficha). Dos lecturas con la misma huella
 * cotizan lo mismo. Las variantes NO entran: pedir precio añade una y eso no hace viejas las condiciones.
 */
export function firmaRiesgoMoto(r: Riesgo): string {
  const d = r.datosVehiculo
  const vehiculo = d === null ? null : Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'confirmadoAt').sort(([a], [b]) => a.localeCompare(b)))
  const figuras = [...r.figuras]
    .map((f) => ({ rol: f.rol, clienteId: f.clienteId, empresa: f.empresa, faltan: f.faltan === null ? null : [...f.faltan].sort() }))
    .sort((a, b) => a.rol.localeCompare(b.rol))
  // El cliente de la oportunidad entra: sin figura «tomador», el tomador ES él (`tomadorDelRiesgo`).
  return JSON.stringify({ oportunidad: r.oportunidad.id, cliente: r.oportunidad.clienteId, ramo: r.oportunidad.ramo, roles: [...r.roles].sort(), vehiculo, figuras })
}

/**
 * Por qué AHORA no se puede pedir precio desde el cotizador embebido (`null` = nada lo impide). Orden: lo que el
 * corredor tiene a medias arriba manda (así sabe qué cerrar); después, la relectura en curso; después, el desfase.
 */
export function motivoBloqueoCotizador(e: {
  editandoVehiculo: boolean
  editandoFiguras: boolean
  recargando: boolean
  /** La pantalla ya trae OTRO riesgo que el que se leyó al abrir el cotizador. */
  riesgoCambiado: boolean
  /** Lo que el servidor leyó al abrir no coincide con lo que pinta la pantalla. */
  pantallaDesfasada: boolean
}): string | null {
  if (e.editandoVehiculo) return 'Estás editando «Datos del vehículo»: guarda o cancela antes de pedir precio (se cotiza con lo guardado).'
  if (e.editandoFiguras) return 'Estás cambiando «Intervinientes»: termina antes de pedir precio (se cotiza con las personas guardadas).'
  if (e.recargando) return 'Releyendo el riesgo…'
  if (e.riesgoCambiado) return 'Los datos del riesgo han cambiado: se están volviendo a leer las condiciones. No se pide precio con los anteriores.'
  if (e.pantallaDesfasada) return 'Lo que hay guardado no coincide con lo de esta pantalla: se está releyendo el riesgo. No se pide precio hasta que coincidan.'
  return null
}
